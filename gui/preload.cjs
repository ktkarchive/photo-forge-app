const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ktk', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  analyzeForReview: (payload) => ipcRenderer.invoke('analyze-for-review', payload),
  applyReviewExport: (payload) => ipcRenderer.invoke('apply-review-export', payload),
})
