require('dotenv').config();

const path = require('path');
const { spawnSync } = require('child_process');
const { main: storeResults } = require('./storeMlTrainingResults');

async function train() {
  const nodeResult = spawnSync(process.execPath, [path.join(__dirname, '..', 'ml', 'train_overall_nb.js')], {
    stdio: 'inherit',
    env: process.env
  });
  if (nodeResult.error) throw nodeResult.error;
  if (nodeResult.status !== 0) throw new Error(`Node review trainer exited with status ${nodeResult.status}`);

  const python = process.env.ML_PYTHON || path.join(
    __dirname, '..', 'ml', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  );
  const result = spawnSync(python, [path.join(__dirname, '..', 'ml', 'train.py')], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONUTF8: process.env.PYTHONUTF8 || '1' }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Training script exited with status ${result.status}`);
  await storeResults();
}

train().catch(error => {
  console.error('[ML] Huấn luyện thất bại:', error.message);
  process.exitCode = 1;
});
