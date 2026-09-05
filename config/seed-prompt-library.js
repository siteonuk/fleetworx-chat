const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });

const mongoose = require('mongoose');
const {
  SystemRoles,
  PrincipalType,
  ResourceType,
  AccessRoleIds,
} = require('librechat-data-provider');
const { createModels } = require('@librechat/data-schemas');
const connect = require('./connect');
const { askQuestion, coloredConsole } = require('./helpers');
const db = require('~/models');
const { grantPermission } = require('~/server/services/PermissionService');
const promptLibrary = require('./prompt-library.json');

const { User, PromptGroup } = createModels(mongoose);

const COMMAND_REGEX = /^[a-z0-9-]+$/;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = { adminEmail: null, dryRun: false };
  for (const arg of args) {
    if (arg.startsWith('--admin=')) {
      parsed.adminEmail = arg.slice('--admin='.length).trim();
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    }
  }
  return parsed;
};

const selectAdmin = async (admins, preferredEmail) => {
  if (preferredEmail) {
    const admin = admins.find((a) => a.email.toLowerCase() === preferredEmail.toLowerCase());
    if (!admin) {
      coloredConsole.red(`No admin found with email "${preferredEmail}".`);
      process.exit(1);
    }
    return admin;
  }

  if (admins.length === 0) {
    coloredConsole.red('No admin accounts found in MongoDB. Aborting.');
    process.exit(1);
  }

  coloredConsole.cyan(`Found ${admins.length} admin account${admins.length > 1 ? 's' : ''}:`);
  admins.forEach((admin, i) => {
    coloredConsole.white(`  ${i + 1}) ${admin.name || 'Admin'} <${admin.email}>`);
  });

  const answer = await askQuestion(
    'Select the admin to own the prompt library (number, or type an email, or q to quit)',
  );
  const trimmed = answer.trim();
  if (trimmed.toLowerCase() === 'q') {
    process.exit(0);
  }

  const asIndex = parseInt(trimmed, 10);
  if (!Number.isNaN(asIndex) && asIndex >= 1 && asIndex <= admins.length) {
    return admins[asIndex - 1];
  }

  const byEmail = admins.find((a) => a.email.toLowerCase() === trimmed.toLowerCase());
  if (!byEmail) {
    coloredConsole.red('Invalid selection. Run the script again.');
    process.exit(1);
  }
  return byEmail;
};

const grantAccess = async ({ principalType, principalId, resourceId, accessRoleId, adminId }) => {
  try {
    await grantPermission({
      principalType,
      principalId,
      resourceType: ResourceType.PROMPTGROUP,
      resourceId,
      accessRoleId,
      grantedBy: adminId,
    });
    return true;
  } catch (err) {
    coloredConsole.red(`  ⚠️  Failed to grant ${accessRoleId}: ${err.message}`);
    return false;
  }
};

const seed = async ({ admin, dryRun }) => {
  const adminId = admin._id.toString();
  const adminName = admin.name || admin.email;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  coloredConsole.orange(
    `\nSeeding ${promptLibrary.length} prompts as ${adminName} <${admin.email}>${dryRun ? ' (DRY RUN)' : ''}...`,
  );

  for (const tpl of promptLibrary) {
    if (!tpl.name || !tpl.input) {
      coloredConsole.red(`  ⚠️  Skipping invalid template: ${JSON.stringify(tpl)}`);
      failed += 1;
      continue;
    }
    if (tpl.command && !COMMAND_REGEX.test(tpl.command)) {
      coloredConsole.red(
        `  ⚠️  Skipping "${tpl.name}": command "${tpl.command}" must be [a-z0-9-].`,
      );
      failed += 1;
      continue;
    }

    const existing = await PromptGroup.findOne({ name: tpl.name, author: adminId }).lean();
    if (existing) {
      coloredConsole.gray(`  ⏭️  "${tpl.name}" already exists — skipping`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      coloredConsole.gray(`  ➕ [dry-run] would create "${tpl.name}" (/${tpl.command})`);
      created += 1;
      continue;
    }

    try {
      const groupData = { name: tpl.name, oneliner: tpl.description ?? '' };
      if (tpl.command) {
        groupData.command = tpl.command.toLowerCase();
      }

      const result = await db.createPromptGroup({
        prompt: { prompt: tpl.input, type: 'text' },
        group: groupData,
        author: adminId,
        authorName: adminName,
      });

      const groupId = result.prompt?.groupId ?? result.group?._id;
      if (!groupId) {
        throw new Error('No groupId returned from createPromptGroup');
      }

      const ownerOk = await grantAccess({
        principalType: PrincipalType.USER,
        principalId: adminId,
        resourceId: groupId,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        adminId,
      });
      const publicOk = await grantAccess({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceId: groupId,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        adminId,
      });

      if (!ownerOk || !publicOk) {
        coloredConsole.red(`  ⚠️  "${tpl.name}" created but permission grants were incomplete`);
      }
      coloredConsole.green(`  ✅ "${tpl.name}" (/${tpl.command})`);
      created += 1;
    } catch (err) {
      coloredConsole.red(`  ❌ "${tpl.name}": ${err.message}`);
      failed += 1;
    }
  }

  coloredConsole.orange('\nSummary:');
  coloredConsole.green(`  ✅ Created: ${created}`);
  coloredConsole.gray(`  ⏭️  Skipped (already exist): ${skipped}`);
  coloredConsole.red(`  ❌ Failed: ${failed}`);
  if (dryRun) {
    coloredConsole.orange('  DRY RUN — no changes were written to the database.');
  }
};

const main = async () => {
  const { adminEmail, dryRun } = parseArgs();
  try {
    await connect();
    const admins = await User.find({ role: SystemRoles.ADMIN }, 'email name').lean();

    const admin = await selectAdmin(admins, adminEmail);
    await seed({ admin, dryRun });
    process.exit(0);
  } catch (err) {
    coloredConsole.red(`Error seeding prompt library: ${err.message}`);
    process.exit(1);
  }
};

main();