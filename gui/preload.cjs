const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ktk', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  analyzeForReview: (payload) => ipcRenderer.invoke('analyze-for-review', payload),
  applyReviewExport: (payload) => ipcRenderer.invoke('apply-review-export', payload),
  onAnalyzeProgress: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const handler = (_evt, payload) => cb(payload)
    ipcRenderer.on('analyze-progress', handler)
    return () => ipcRenderer.removeListener('analyze-progress', handler)
  },
})
