import { issueJWT } from '../../src/services/auth.service';

// Cookie header for a signed-in user, built the same way the login endpoint builds it
export function authCookie(wallet: string, role = 'USER'): string {
  return `token=${issueJWT(wallet, role)}`;
}
