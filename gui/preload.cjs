const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ktk', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  runCuller: (payload) => ipcRenderer.invoke('run-culler', payload),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  loadRunArtifacts: (outputDir) => ipcRenderer.invoke('load-run-artifacts', outputDir),
  saveOverrides: (outputDir, overrides) => ipcRenderer.invoke('save-overrides', outputDir, overrides),
})
