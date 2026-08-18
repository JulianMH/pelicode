# PeliCode

PeliCode adds a dedicated chat view to the VS Code Activity Bar. Select the chat icon on the left side of the editor to open it.

## Features

- A chat view in the VS Code Activity Bar.
- Local message history for the open chat session.
- The `PeliCode: Focus PeliCode Chat` command to focus the view.
- OpenRouter-powered responses with selectable models.
- Tool calls for workspace file operations, including listing, reading, writing,
  and applying patches.
- Optional reasoning output and tool-call results displayed in the chat.

PeliCode sends chat requests to OpenRouter and can use tool calls to inspect and
modify files in the workspace. Generated responses require an OpenRouter API
key; see the [OpenRouter](#openrouter) section below.

## OpenRouter

The chat uses OpenRouter's `openai/gpt-5.6-luna` model. Set `OPENROUTER_API_KEY` in the environment that launches VS Code. When VS Code is started from the macOS Dock or Finder, it does not automatically inherit values from `.zshrc`; start it with `code .` from a terminal where the variable is set, or configure the variable in the app launch environment.

## Install locally

Package the extension and install the generated VSIX file:

```bash
npx @vscode/vsce package
code --install-extension pelicode-0.0.1.vsix
```

Reload the VS Code window after installation.

## Development

Run `F5` in VS Code to open an Extension Development Host. The watch build is started automatically.
