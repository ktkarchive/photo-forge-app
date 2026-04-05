const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ktk', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  runCuller: (payload) => ipcRenderer.invoke('run-culler', payload),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
})
