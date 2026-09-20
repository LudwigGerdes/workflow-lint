# NOTE: vhs 0.12.0 exits 0 and writes no file (charmbracelet/vhs#787); use 0.11.0.
# Renders the README hero GIF. From the repo root, after `pnpm install && pnpm build`:
#
#   vhs docs/demo/quickstart.tape
#
# Runs 8–12 seconds: lint the sample workflow, apply the safe fixes, lint again.
# Works on a scratch copy so the committed sample stays wrong on purpose.

Output docs/demo/quickstart.gif

Set Shell "bash"
Set FontSize 15
Set Width 1400
Set Height 560
Set Padding 20
Set TypingSpeed 35ms
Set Theme "Catppuccin Mocha"

Hide
  Type 'alias workflow-lint="node $PWD/packages/cli/dist/bin.js"' Enter
  Type "cp docs/demo/order-sync.json /tmp/order-sync.json && cd /tmp && clear" Enter
Show

Type "workflow-lint lint order-sync.json --n8n-version 2.38.3" Enter
Sleep 4s

Type "clear" Enter
Type "workflow-lint lint order-sync.json --n8n-version 2.38.3 --fix" Enter
Sleep 4s

Type "workflow-lint --version" Enter
Sleep 1.5s
