// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileList } from '../FileList';

describe('FileList', () => {
  it('shows load-more controls for an empty page with a continuation', () => {
    const onLoadMore = vi.fn().mockResolvedValue(undefined);

    render(
      <FileList
        listKey="s3:photos:empty"
        entries={[]}
        selectedFiles={new Set()}
        isLoading={false}
        sortField="name"
        sortDirection="asc"
        viewMode="list"
        panelType="remote"
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
        onSort={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onNewFolder={vi.fn()}
        onTransfer={vi.fn()}
        hasMoreEntries
        onLoadMore={onLoadMore}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByText('This folder is empty')).toBeTruthy();
  });
});
