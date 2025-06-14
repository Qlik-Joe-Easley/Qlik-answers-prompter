# Prompter Extension for Qlik Sense

**Prompter** is a Qlik Sense visualization extension that integrates Qlik Answers (Assistants API) to provide interactive Q&A sessions directly in your app. It reads a structured question from a Qlik variable, sends it to a Qlik Answers assistant, and displays the AI-generated response alongside follow‑up capabilities—all within a clean, self‑contained UI.

---

## 🔧 Features

- **Variable‑driven prompts**: Select a Qlik variable to define your initial question.
- **Thread-based conversation**: Maintains context across multiple follow‑up questions in the same session.
- **Inline Q&A UI**: Clean chat window with auto‑scroll, input for follow‑ups, and a “New inquiry” reset.
- **Auto formatting**: Preserves line breaks via CSS for easy‑to‑read responses.
- **Secure & compliant**: Uses Qlik’s CSRF token endpoint; compatible with Qlik Cloud CSP and CORS.

---

## 📦 File Structure

```
Prompter/
├── Prompter.qext       # Qlik extension metadata
├── definition.js       # Property panel definition
├── Prompter.js         # Extension logic & UI (AMD module)
├── style.css           # Custom styles (no inline CSS)
└── icon.png            # 32×32 extension icon
```

---

## ⚙️ Configuration

1. Add **Prompter** to a sheet.
2. In the properties panel under **Prompter Configuration**:
   - **Select Assistant**: Choose one of your published Qlik Answers assistants.
   - **Question Variable**: Select a user‐created variable that contains your prompt text.
3. Close properties; you’ll see the variable name displayed and the **Start inquiry** button.

---

## 🎨 Usage

1. **Start inquiry**: Click the button; the extension reads your variable value, starts a new thread, and sends the question.
2. **View response**: The assistant’s answer appears in the chat window.
3. **Follow‑up**: Type additional questions in the input box and click **Submit**—the conversation context is preserved.
4. **New inquiry**: Resets the thread and clears history, so you can begin a fresh Q&A.

---

## 🛡 Security & CSP

- All network calls go through the Qlik domain (`/api/v1/...`)—no external hosts.
- No inline scripts or styles; all JS in AMD modules and CSS in `style.css`.
- CSRF tokens are fetched via `/api/v1/csrf-token` and attached to every POST.

---

## 📝 Customization

- **Styling**: Modify `style.css` for colors, fonts, or layout tweaks.
- **Property panel**: Add additional settings in `definition.js`, such as UI labels or max thread length.
- **Formatting**: Enhance line‑break rendering or add markdown support by adjusting the `render` logic in `Prompter.js`.

---

## 🆘 Troubleshooting

- **No assistants in dropdown**: Ensure your user has access to at least one published assistant in the tenant.
- **Variable empty**: Check that your selected variable has a defined value (use the Variables panel).
- **CORS/CSP errors**: Confirm that all resources and APIs are under the same Qlik domain; review console errors.

---

## 📚 References

- [Qlik Extensions Quickstart](https://qlik.dev/extend/extend-quickstarts/first-extension/)
- [Qlik Assistants API](https://qlik.dev/apis/rest/assistants)
- [Content Security Policy in Qlik Cloud](https://qlik.dev/extend/security/content-security-policy)

---

