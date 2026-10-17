// The shared *.vexoul.net sign-in (vex-auth, through @vex/ui/account). createAccount() finds vex-auth
// itself: VITE_AUTH_BASE overrides it (a copy hosted elsewhere points it at its own, or sets it empty: that turns
// sign-in off, and the menu's "Sign in" is greyed out).
import { createAccount } from '@vex/ui/account'

export const account = createAccount()
