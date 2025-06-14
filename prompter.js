define(["jquery", "qlik"], function($, qlik) {
  // Helper to fetch CSRF token
  function getCSRFToken() {
    return fetch("/api/v1/csrf-token", {
      method: "GET",
      credentials: "include"
    })
    .then(res => {
      if (!res.ok) throw new Error(`Failed to fetch CSRF token: ${res.status}`);
      return res.headers.get("qlik-csrf-token");
    });
  }

  return {
    // Property-panel definition
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
                  .then(res => res.ok ? res.json() : Promise.reject(res.status))
                  .then(json => (json.data || []).map(a => ({ value: a.id, label: a.name })))
                  .catch(err => { console.error("Failed to load assistants", err); return []; });
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

    // Main rendering logic
    paint: function($element, layout) {
      $element.empty();
      const assistantId = layout.assistantId;
      const questionVarName = layout.questionVar;

      if (!assistantId || !questionVarName) {
        $element.append(
          '<div class="prompter-error">Please configure both Assistant and Question Variable.</div>'
        );
        return;
      }

      // Initialize chat state
      this._state = this._state || { threadId: null, messages: [] };
      const state = this._state;

      // Build UI only once
      let container = $element.find(".prompter-container");
      if (!container.length) {
        container = $('<div class="prompter-container"></div>');

        // Display chosen variable
        const varDisplay = $(
          '<div style="margin-bottom:8px;font-style:italic;color:#555;"></div>'
        ).text("Question variable: " + questionVarName);
        container.append(varDisplay);

        // Start button
        const startBtn = $('<button class="prompter-start">Start inquiry</button>');
        container.append(startBtn);

        // Chat window
        const chatWindow = $('<div class="prompter-chat" style="display:none;"></div>');
        const messagesDiv = $('<div class="prompter-messages"></div>').css({
          flex: "1",
          overflow: "auto",
          padding: "8px",
          background: "#f9f9f9",
          whiteSpace: "pre-wrap"
        });
        const followDiv = $('<div class="prompter-followup"></div>').css({
          display: "flex",
          alignItems: "center",
          padding: "8px",
          borderTop: "1px solid #ccc"
        });
        const followInput = $(
          '<input type="text" class="prompter-input" placeholder="Ask a follow-up..." style="flex:1;margin-right:8px;">'
        );
        const submitBtn = $('<button class="prompter-submit">Submit</button>');
        const newBtn = $('<button class="prompter-new">New inquiry</button>');

        followDiv.append(followInput, submitBtn, newBtn);
        chatWindow.css({
          display: "flex",
          flexDirection: "column",
          border: "1px solid #ccc",
          borderRadius: "4px",
          height: "300px",
          background: "#fff"
        }).append(messagesDiv, followDiv);

        container.append(chatWindow);
        $element.append(container);

        // Start inquiry: read variable & create thread
        startBtn.on("click", () => {
          startBtn.prop("disabled", true);
          qlik.currApp().variable.getContent(questionVarName, function(varDef) {
            // read user-set value: qString for string variables, fallback to qDefinition
            const raw = varDef.qContent.qString != null 
                          ? varDef.qContent.qString 
                          : varDef.qContent.qDefinition || "";
            const questionText = raw.trim();
            if (!questionText) {
              showError(new Error("Variable " + questionVarName + " is empty"));
              return;
            }
            getCSRFToken()
              .then(token =>
                fetch(`/api/v1/assistants/${assistantId}/threads`, {
                  method: "POST",
                  credentials: "include",
                  headers: {
                    "Content-Type": "application/json",
                    "qlik-csrf-token": token
                  },
                  body: JSON.stringify({ name: `Prompter_${Date.now()}` })
                })
              )
              .then(res =>
                res.ok ? res.json() : res.text().then(t => { throw new Error(t); })
              )
              .then(json => {
                const thread = json.data || json;
                state.threadId = thread.id;
                state.messages = [];
                chatWindow.show();
                sendInteraction(questionText);
              })
              .catch(showError);
          });
        });

        // Submit follow-up
        submitBtn.on("click", () => {
          const txt = followInput.val().trim();
          if (txt) sendInteraction(txt);
        });
        // New inquiry
        newBtn.on("click", () => {
          state.threadId = null;
          state.messages = [];
          messagesDiv.empty();
          followInput.val("");
          chatWindow.hide();
          startBtn.show().prop("disabled", false);
        });

        // Core: send a message
        function sendInteraction(text) {
          state.messages.push({ user: text, bot: "..." });
          render();
          followInput.val("").prop("disabled", true);
          submitBtn.prop("disabled", true);

          getCSRFToken()
            .then(token =>
              fetch(
                `/api/v1/assistants/${assistantId}/threads/${state.threadId}/actions/invoke`,
                {
                  method: "POST",
                  credentials: "include",
                  headers: {
                    "Content-Type": "application/json",
                    "qlik-csrf-token": token
                  },
                  body: JSON.stringify({
                    input: {
                      prompt: text,
                      promptType: "thread",
                      includeText: true
                    }
                  })
                }
              )
            )
            .then(res =>
              res.ok ? res.json() : res.text().then(t => { throw new Error(t); })
            )
            .then(json => {
              const reply = json.output ||
                            (json.data && json.data.output) ||
                            "";
              state.messages[state.messages.length - 1].bot = reply;
              render();
              followInput.prop("disabled", false).focus();
              submitBtn.prop("disabled", false);
            })
            .catch(showError);
        }

        // Render chat
        function render() {
          messagesDiv.empty();
          state.messages.forEach(m => {
            messagesDiv.append(
              $('<div class="prompter-user"></div>').text(`You: ${m.user}`)
            );
            messagesDiv.append(
              $('<div class="prompter-assistant"></div>').text(`Assistant: ${m.bot}`)
            );
          });
          messagesDiv.scrollTop(messagesDiv.prop("scrollHeight"));
        }

        // Show errors
        function showError(err) {
          console.error(err);
          $element.append(
            `<div class="prompter-error" style="color:#a00;background:#fee;padding:6px;border:1px solid #a00;margin-top:8px;">
              Error: ${err.message}
            </div>`
          );
        }
      }
    }
  };
});