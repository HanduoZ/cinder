import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cinder", {
  listTasks: () => ipcRenderer.invoke("tasks:list"),
  createTask: (input) => ipcRenderer.invoke("tasks:create", input),
  continueTask: (taskId, prompt) => ipcRenderer.invoke("tasks:continue", taskId, prompt),
  laterTask: (taskId) => ipcRenderer.invoke("tasks:later", taskId),
  completeTask: (taskId) => ipcRenderer.invoke("tasks:complete", taskId),
  searchTasks: (query) => ipcRenderer.invoke("tasks:search", query),
  resumeTask: (taskId, prompt) => ipcRenderer.invoke("tasks:resume", taskId, prompt),
  openPath: (filePath) => ipcRenderer.invoke("app:open-path", filePath)
});
