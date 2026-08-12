const SUPPORTED_EXTENSIONS = new Set(['xlsx', 'xls', 'csv']);

function fileExtension(file) {
  const name = String(file?.name || '');
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function queueId(file, index) {
  return `${index}-${String(file.name || '')}-${Number(file.size || 0)}-${Number(file.lastModified || 0)}`;
}

function createBulkQueue(files) {
  return Array.from(files || []).map((file, index) => {
    const supported = SUPPORTED_EXTENSIONS.has(fileExtension(file));
    return {
      id: queueId(file, index),
      file,
      selected: false,
      status: supported ? 'pending' : 'rejected',
      reportType: null,
      preview: null,
      error: supported ? null : 'Format tidak didukung. Gunakan .xlsx, .xls, atau .csv.',
      result: null,
    };
  });
}

function eligibleQueueItems(queue) {
  return (queue || []).filter((item) => item.selected && item.status === 'ready' && item.preview?.canImport && !item.preview?.duplicateHash);
}

function requeueFailedItems(queue) {
  return (queue || []).map((item) => {
    const retryable = item.status === 'failed' && item.preview?.canImport && !item.preview?.duplicateHash;
    return retryable
      ? { ...item, status: 'ready', selected: true, error: null }
      : item;
  });
}

function summarizeQueue(queue) {
  const summary = {
    total: 0,
    pending: 0,
    checking: 0,
    ready: 0,
    duplicate: 0,
    invalid: 0,
    rejected: 0,
    importing: 0,
    imported: 0,
    failed: 0,
    selected: 0,
    selectedRows: 0,
  };
  for (const item of queue || []) {
    summary.total += 1;
    if (Object.hasOwn(summary, item.status)) summary[item.status] += 1;
    if (item.selected) {
      summary.selected += 1;
      summary.selectedRows += Number(item.preview?.totalRows || 0);
    }
  }
  return summary;
}

module.exports = { createBulkQueue, eligibleQueueItems, requeueFailedItems, summarizeQueue };
