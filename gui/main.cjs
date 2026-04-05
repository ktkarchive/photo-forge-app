const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

function getProjectRoot() {
  return path.resolve(__dirname, '..')
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

  if (payload.dryRun) args.push('--dry-run')
  if (payload.move) args.push('--move')

  return await new Promise((resolve) => {
    const cp = spawn('python3', args, { cwd: root, env: { ...process.env, PYTHONUNBUFFERED: '1' } })
    let out = ''
    let err = ''
    cp.stdout.on('data', (d) => (out += d.toString()))
    cp.stderr.on('data', (d) => (err += d.toString()))
    cp.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout: out, stderr: err })
    })
  })
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
