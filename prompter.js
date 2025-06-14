define(["jquery", "qlik"], function($, qlik) {
  /***************************************************************************
   * Helper: Fetch CSRF token for Qlik REST calls
   ***************************************************************************/
  function getCSRFToken() {
    return fetch("/api/v1/csrf-token", {
      method: "GET",
      credentials: "include"
    })
      .then(res => {
        if (!res.ok) throw new Error(`CSRF token error: ${res.status}`);
        return res.headers.get("qlik-csrf-token");
      });
  }

  return {
    /***************************************************************************
     * 1) Property-panel definition
     ***************************************************************************/
    definition: {
      type: "items",
      component: "accordion",
      items: {
        PrompterConfig: {
          label: "Prompter Configuration",
          type: "items",
          items: {
            assistantId: {
              ref: "assistantId",
              label: "Select Assistant",
              type: "string",
              component: "dropdown",
              options: function() {
                return fetch("/api/v1/assistants?limit=100", { credentials: "include" })
                  .then(r => r.ok ? r.json() : Promise.reject(r.status))
                  .then(json => (json.data || []).map(a => ({ value: a.id, label: a.name })))
                  .catch(() => []);
              }
            },
            questionVar: {
              ref: "questionVar",
              label: "Question Variable",
              type: "string",
              component: "dropdown",
              options: function() {
                return new Promise(resolve => {
                  qlik.currApp().getList("VariableList", function(list) {
                    const opts = list.qVariableList.qItems
                      .filter(v => !v.qName.startsWith("$"))
                      .map(v => ({ value: v.qName, label: v.qName }));
                    resolve(opts);
                  });
                });
              }
            }
          }
        }
      }
    },

    /***************************************************************************
     * 2) Main rendering logic
     ***************************************************************************/
    paint: function($element, layout) {
      $element.empty();
      const assistantId   = layout.assistantId;
      const questionVar   = layout.questionVar;

      // Require both config props
      if (!assistantId || !questionVar) {
        $element.append(
          '<div class="prompter-error">Please configure both Assistant and Question Variable.</div>'
        );
        return;
      }

      // State: conversation thread + messages
      this._state = this._state || { threadId: null, messages: [] };
      const state = this._state;

      // Determine extension base URL for icons by scanning loaded scripts
      let extBaseUrl = '';
      Array.from(document.getElementsByTagName('script')).some(s => {
        if (s.src && s.src.indexOf('prompter-vi.js') !== -1) {
          extBaseUrl = s.src.replace(/\/prompter-vi\.js.*$/, '');
          return true;
        }
        return false;
      });

      // Ensure extension CSS is loaded
      if (!$('head').find('#prompter-css').length) {
        $('head').append(
          $('<link>', {
            id: 'prompter-css',
            rel: 'stylesheet',
            type: 'text/css',
            href: extBaseUrl + '/style.css'
          })
        );
      }

      /*************************************************************************
       * 3) Build UI container & core elements (once)
       *************************************************************************/
      let container = $element.find(".prompter-container");
      if (!container.length) {
        // Outer flex container
        container = $('<div class="prompter-container"></div>').css({
          display: "flex",
          flexDirection: "column",
          height: "100%"
        });

        // 3a) Toolbar (Start / New Inquiry)
        const toolbar = $('<div class="prompter-toolbar"></div>').css({
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px"
        });
        const startBtn = $('<button class="prompter-start">Start inquiry</button>').css({
          padding: "0.6em 1.2em",
          fontSize: "14px",
          backgroundColor: "#4caf50",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer"
        });
        const newBtn = $('<button class="prompter-new">New inquiry</button>').css({
          padding: "0.6em 1.2em",
          fontSize: "14px",
          backgroundColor: "#26a69a",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          display: "none"
        });
        toolbar.append(startBtn, newBtn);
        container.append(toolbar);

        // 3b) Chat window (flexible height)
        const chatWindow = $('<div class="prompter-chat"></div>').css({
          display: "flex",
          flexDirection: "column",
          flex: "1 1 auto",
          minHeight: 0,
          position: "relative"
        });

        // Placeholder brain icon (static)
        const placeholder = $('<img class="prompter-placeholder" />')
          .attr('src', extBaseUrl + '/icons/aibrain.svg');
        chatWindow.append(placeholder);

        // Pulsing loader icon (hidden until loading)
        const loader = $('<img class="prompter-loader" />')
          .attr('src', extBaseUrl + '/icons/loading.svg')
          .hide();
        chatWindow.append(loader);

        // 3e) Textual spinner (fallback)
        const textSpinner = $('<div class="prompter-spinner">Thinking</div>').hide();
        chatWindow.append(textSpinner);

        // 3f) Messages pane
        const messagesDiv = $('<div class="prompter-messages"></div>');
        chatWindow.append(messagesDiv);

        // 3g) Follow-up input & Submit
        const followDiv = $('<div class="prompter-followup"></div>').css({
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '8px',
          borderTop: '1px solid #ccc'
        });
        // Follow-up input (flexible)
        const followInput = $('<input type="text" class="prompter-input" placeholder="Ask a follow-up question..."/>');
        // Follow‑up submit button (styled via CSS)
        const submitBtn = $('<button class="prompter-submit">Submit</button>');
        followDiv.append(followInput, submitBtn);
        chatWindow.append(followDiv);

        container.append(chatWindow);
        $element.append(container);

        /*************************************************************************
         * 4) Utility functions to control spinner & loader
         *************************************************************************/
        let spinInterval;
        function showSpinner() {
          // show both loader and text spinner
          loader.show();
          textSpinner.show();
          let count = 0;
          spinInterval = setInterval(() => {
            count = (count + 1) % 4;
            textSpinner.text("Thinking" + ".".repeat(count));
          }, 400);
        }
        function hideSpinner() {
          clearInterval(spinInterval);
          loader.hide();
          textSpinner.hide();
        }

        /*************************************************************************
         * 5) Keyboard: pressing Enter submits follow-up
         *************************************************************************/
        followInput.on("keydown", e => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitBtn.click();
          }
        });

        /*************************************************************************
         * 6) Start Inquiry: hide placeholder, show loader, create thread & first msg
         *************************************************************************/
        startBtn.on("click", () => {
          startBtn.prop("disabled", true);
          newBtn.show();
          placeholder.hide();
          qlik.currApp().variable.getContent(questionVar, varDef => {
            const raw = varDef.qContent.qString != null
                      ? varDef.qContent.qString
                      : varDef.qContent.qDefinition || "";
            const text = raw.trim();
            if (!text) {
              showError("Variable is empty");
              return;
            }
            showSpinner();
            getCSRFToken()
              .then(token => fetch(
                `/api/v1/assistants/${assistantId}/threads`,
                {
                  method: "POST",
                  credentials: "include",
                  headers: {
                    "Content-Type": "application/json",
                    "qlik-csrf-token": token
                  },
                  body: JSON.stringify({ name: `Prompter_${Date.now()}` })
                }
              ))
              .then(r => r.ok ? r.json() : r.text().then(t => { throw t; }))
              .then(json => {
                state.threadId = (json.data || json).id;
                state.messages = [];
                render();
                sendInteraction(text);
              })
              .catch(err => showError(err));
          });
        });

        /*************************************************************************
         * 7) New Inquiry: reset everything & show placeholder
         *************************************************************************/
        newBtn.on("click", () => {
          state.threadId = null;
          state.messages = [];
          messagesDiv.empty();
          followInput.val("");
          placeholder.show();
          startBtn.prop("disabled", false);
          newBtn.hide();
        });

        /*************************************************************************
         * 8) Submit follow-up handler
         *************************************************************************/
        submitBtn.on("click", () => {
          const txt = followInput.val().trim();
          if (txt) sendInteraction(txt);
        });

        /*************************************************************************
         * 9) Core message sender
         *************************************************************************/
        function sendInteraction(text) {
          state.messages.push({ user: text, bot: "..." });
          render();
          followInput.val("").prop("disabled", true);
          submitBtn.prop("disabled", true);
          showSpinner();
          getCSRFToken()
            .then(token => fetch(
              `/api/v1/assistants/${assistantId}/threads/${state.threadId}/actions/invoke`,
              {
                method: "POST", credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  "qlik-csrf-token": token
                },
                body: JSON.stringify({
                  input: { prompt: text, promptType: "thread", includeText: true }
                })
              }
            ))
            .then(r => r.ok ? r.json() : r.text().then(t => { throw t; }))
            .then(json => {
              const reply = json.output || (json.data && json.data.output) || "";
              state.messages[state.messages.length - 1].bot = reply;
              render();
              followInput.prop("disabled", false).focus();
              submitBtn.prop("disabled", false);
            })
            .catch(err => showError(err))
            .finally(() => hideSpinner());
        }

        /*************************************************************************
         * 10) Render conversation
         *************************************************************************/
        function render() {
          messagesDiv.empty();
          state.messages.forEach(m => {
            // Render user message with preserved line breaks
            messagesDiv.append(
              $('<div class="prompter-user"></div>').html(
                `You: ${m.user.replace(/\n/g, '<br/>')}`
              )
            );
            // Render assistant message with preserved line breaks
            messagesDiv.append(
              $('<div class="prompter-assistant"></div>').html(
                `Assistant: ${m.bot.replace(/\n/g, '<br/>')}`
              )
            );
          });
          messagesDiv.scrollTop(messagesDiv.prop("scrollHeight"));
        }

        /*************************************************************************
         * 11) Error display
         *************************************************************************/
        function showError(msg) {
          const text = msg.message || msg;
          $element.append(
            `<div class="prompter-error">Error: ${text}</div>`
          );
        }
      }
    }
  };
});
