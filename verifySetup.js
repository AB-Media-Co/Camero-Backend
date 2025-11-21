import fs from 'fs';

const requiredFiles = [
  'config/db.js',
  'config/config.js',
  'models/User.js',
  'models/Plan.js',
  'models/UserActivity.js',
  'middleware/auth.js',
  'middleware/roleAuth.js',
  'middleware/planAuth.js',
  'routes/auth.js',
  'routes/admin.js',
  'routes/plan.js',
  'controllers/authController.js',
  'controllers/adminController.js',
  'controllers/planController.js',
  'socket/socketHandler.js',
  'scripts/seed.js',
  'utils/constants.js',
  'server.js'
];

console.log('🔍 Verifying project structure...\n');

let allExists = true;

requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  const icon = exists ? '✅' : '❌';
  console.log(`${icon} ${file}`);
  if (!exists) allExists = false;
});

if (allExists) {
  console.log('\n🎉 All files exist! Ready to code.');
} else {
  console.log('\n⚠️  Some files are missing. Please create them.');
}