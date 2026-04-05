const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

function getProjectRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'embedded')
  }
  return path.join(__dirname, 'embedded')
}

function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const cp = spawn(cmd, args, opts)
    let out = ''
    let err = ''
    cp.stdout.on('data', (d) => (out += d.toString()))
    cp.stderr.on('data', (d) => (err += d.toString()))
    cp.on('close', (code) => resolve({ code, stdout: out, stderr: err }))
  })
}

async function ensurePythonDeps(root) {
  const check = await runProcess('python3', ['-c', 'import cv2, numpy, mediapipe'], {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })
  if (check.code === 0) return { ok: true, installed: false }

  const install = await runProcess('python3', ['-m', 'pip', 'install', '--user', '-r', 'requirements.txt'], {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })
  return { ok: install.code === 0, installed: true, checkErr: check.stderr, installOut: install.stdout, installErr: install.stderr }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    backgroundColor: '#161616',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'ktk.select',
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

ipcMain.handle('pick-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled || !res.filePaths?.length) return ''
  return res.filePaths[0]
})

ipcMain.handle('run-culler', async (_evt, payload) => {
  const root = getProjectRoot()
  const args = ['-m', 'ktk_select.cli', 'run', '--input', payload.inputDir, '--output', payload.outputDir]

  args.push('--eyes-level', String(payload.levels?.eyes_closed ?? 2))
  args.push('--focus-level', String(payload.levels?.out_of_focus_subject ?? 2))
  args.push('--blur-level', String(payload.levels?.motion_blur ?? 1))
  args.push('--exposure-level', String(payload.levels?.exposure_bad ?? 1))
  args.push('--duplicate-level', String(payload.levels?.duplicate ?? 1))
  args.push('--occlusion-level', String(payload.levels?.occlusion ?? 0))
  args.push('--composition-level', String(payload.levels?.composition_bad ?? 0))

  args.push('--export-mode', String(payload.exportMode || 'copy'))

  const prep = await ensurePythonDeps(root)
  if (!prep.ok) {
    return {
      ok: false,
      code: 1,
      stdout: prep.installOut || '',
      stderr: `의존성 설치 실패\n${prep.checkErr || ''}\n${prep.installErr || ''}`,
    }
  }

  const ran = await runProcess('python3', args, {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONPATH: root },
  })
  return { ok: ran.code === 0, code: ran.code, stdout: ran.stdout, stderr: ran.stderr }
})

ipcMain.handle('open-path', async (_evt, p) => {
  if (!p) return false
  await shell.openPath(p)
  return true
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
