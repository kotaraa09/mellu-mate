// The tools check for a computer with no Node.js. Mellu.mate's session opener and checks are
// Node scripts, so without Node.js a session opens as plain Claude Code and nothing says why.
// A hooks module runs inside Claude Code itself, so it can still notice, and ask Claude to
// offer the install. A beginner who never installed a developer tool gets one yes to answer.
//
// With Node.js installed, the session opener (scripts/first-run.mjs) checks git and its name
// and email, so this says nothing then. Without Node.js, it checks git too.
//
// Claude Code takes one hook per event from a plugin, and clear-reminder.ts owns
// classic.SessionStart, so it runs the programs and passes the results here as plain values.

export type Os = 'win32' | 'darwin' | 'linux'

const INSTALL = {
  node: {
    win32: 'run `winget install --id OpenJS.NodeJS.LTS -e`',
    darwin: 'download the LTS installer from https://nodejs.org and open it',
    linux: 'install the LTS version from https://nodejs.org, or with the system\'s package manager',
  },
  git: {
    win32: 'run `winget install --id Git.Git -e`',
    darwin: 'run `xcode-select --install`, which installs Apple\'s developer tools with Git in them',
    linux: 'install it with the system\'s package manager, for example `sudo apt install git`',
  },
}

// The note for Claude, or null when there is nothing to say.
export function toolsNote(os: Os, hasNode: boolean, hasGit: boolean): string | null {
  if (hasNode) return null
  const lines = [
    'Mellu.mate tools check: Node.js is not installed. Mellu.mate runs on it: without it there is ' +
      'no memory between sessions and no checks after each change. ' +
      `The install: ${INSTALL.node[os]}.`,
  ]
  if (!hasGit) {
    lines.push('Git is not installed either. Without it there are no saved versions to go back to, ' +
      `and nothing can be published. The install: ${INSTALL.git[os]}.`)
  }
  lines.push('Before anything else, tell the user in plain words what is missing and what they lose, ' +
    'and offer to install it for them. Run an install command only after the user says yes, and ' +
    'never with administrator rights they did not approve. Where the install needs a download or ' +
    'a click, tell them the steps instead. Then tell them to close and reopen Claude, and Mellu.mate ' +
    'starts. Then answer what they asked.')
  return lines.join('\n')
}
