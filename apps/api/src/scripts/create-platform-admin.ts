import { randomBytes } from 'node:crypto';
import { connectToDatabase, disconnectFromDatabase } from '../db/connection';
import { runAsPlatform } from '../db/tenantContext';
import { PlatformUser, PLATFORM_ROLES, audit } from '../models';
import { hashPassword } from '../services/password';
import { generateTotpSecret, otpauthUrl } from '../services/totp';

/**
 * Creates (or resets) a Super Admin user and prints a one-time password + 2FA secret.
 *   npm run platform:admin -- you@company.com "Your Name" [owner|support|finance]
 */
async function main() {
  const [email, name = 'Platform Owner', role = 'owner'] = process.argv.slice(2);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('usage: platform:admin -- <email> [name] [role]');
  if (!(PLATFORM_ROLES as readonly string[]).includes(role)) throw new Error(`role must be one of ${PLATFORM_ROLES.join(', ')}`);
  await connectToDatabase({ autoIndex: true });
  const password = randomBytes(12).toString('base64url');
  const totpSecret = generateTotpSecret();
  await runAsPlatform('script: create platform admin', async () => {
    await PlatformUser.updateOne(
      { email: email.toLowerCase() },
      { $set: { name, role, passwordHash: await hashPassword(password), totpSecret, active: true } },
      { upsert: true },
    );
    await audit({ actorType: 'system', action: 'platform.admin_created', target: email.toLowerCase() });
  });
  console.log('\nSuper Admin ready. Shown ONCE — store it in your password manager:\n');
  console.log(`  Email:     ${email.toLowerCase()}`);
  console.log(`  Password:  ${password}`);
  console.log(`  2FA key:   ${totpSecret}`);
  console.log(`  2FA URL:   ${otpauthUrl(totpSecret, email.toLowerCase())}\n`);
  console.log('Add the 2FA key to Google Authenticator / 1Password, then log in to the Super Admin portal.\n');
  await disconnectFromDatabase();
}

main().catch(async (err) => {
  console.error('[platform:admin] failed:', err.message);
  await disconnectFromDatabase().catch(() => {});
  process.exit(1);
});
