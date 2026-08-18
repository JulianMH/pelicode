# PeliCode

<p align="center">
  <img src="media/pelican.svg" alt="PeliCode pelican icon" width="128">
</p>

PeliCode is a very basic chat-agent harness for VS Code for educational purposes 
and my own usage on personal projects. It is focussed on making clear what 
exactly the agent is prompted rather than hiding it. It allows viewing and editing files, 
but not much else. The harness works very well with small
LLM models since it does not overload the context with long system prompts and many tools.

PeliCode is still under active development and is intended for experimentation rather
than production use. Most of its development has been dogfooded: PeliCode has
been used to develop PeliCode itself.

## Features

- Multiple local chat tabs with persisted history in the projects.
- Selectable OpenRouter models and displayed request costs.
- Workspace tools for listing, reading, writing, patching, moving, and removing
  files.
- Visible tool results and optional model reasoning in the chat.

Tool calls can modify files without a confirmation step. Only use PeliCode in a
workspace you trust, and review its changes as you would changes from any other
coding agent.

## Screenshot

<p align="center">
  <img src="screenshot.png" alt="PeliCode screenshot">
</p>

## Features still under development

- [ ] Keep PeliCode file access strictly inside trusted workspace folders.
- [ ] Keep long chats and large file edits fast and cost-efficient, take context limit into account.
- [ ] Extend PeliCode to accept remote control from other devices via WebSockets.
- [ ] Support selecting files across multi-root workspaces.
- [ ] Give each chat its own Git branch workspace.
- [ ] Compare several models and rank their answers by quality, time, and cost.
- [ ] Add an adversarial mode with an implementer and reviewer agent.
- [ ] Let users choose tool permission presets, including read-only access.
- [ ] Add an evaluation tool for checking agent work.
- [ ] Add focused Git tools for common repository tasks.

## OpenRouter

PeliCode requires an `OPENROUTER_API_KEY` in the environment that launches VS
Code. The default model is `openai/gpt-5.6-luna`, and other supported models can
be selected in the chat UI.

## Install locally

Package the extension and install the generated VSIX file:

```bash
npx @vscode/vsce package
code --install-extension pelicode-0.0.1.vsix
```

Reload the VS Code window after installation.


## Development

During development, the
`Install Chatbot and Reload` status-bar action rebuilds, installs, and reloads
the current VSIX when PeliCode is already installed.