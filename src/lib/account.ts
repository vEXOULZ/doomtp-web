// The shared *.vexoul.net sign-in (vexoulz-auth, through @vexoulz/ui/account). createAccount() finds vexoulz-auth
// itself: VITE_AUTH_BASE overrides it (a copy hosted elsewhere points it at its own, or sets it empty: that turns
// sign-in off, and the menu's "Sign in" is greyed out).
import { createAccount } from '@vexoulz/ui/account'

export const account = createAccount()
