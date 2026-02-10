import { useEffect } from 'react';
import { useLocalPanelStore } from '@/stores/localPanelStore';
import { PanelHeader } from './PanelHeader';
import { FileList } from './FileList';

export function LocalPanel() {
  const {
    currentPath,
    entries,
    selectedFiles,
    isLoading,
    error,
    sortField,
    sortDirection,
    viewMode,
    navigateTo,
    refresh,
    selectFile,
    setSort,
  } = useLocalPanelStore();

  useEffect(() => {
    async function init() {
      const home = await window.api.invoke('fs:get-home');
      navigateTo(home);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader
        label="Local"
        path={currentPath}
        isActive={true}
        onNavigate={navigateTo}
        onRefresh={refresh}
      />

      {error && (
        <div className="px-3 py-2 text-[12px] text-destructive bg-destructive/5 border-b border-destructive/20">
          {error}
        </div>
      )}

      <FileList
        entries={entries}
        selectedFiles={selectedFiles}
        isLoading={isLoading}
        sortField={sortField}
        sortDirection={sortDirection}
        viewMode={viewMode}
        onSelect={selectFile}
        onNavigate={navigateTo}
        onSort={setSort}
      />
    </div>
  );
}
