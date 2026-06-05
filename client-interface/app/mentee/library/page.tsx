'use client';

import LibraryView from '@/components/shared/library/LibraryView';

export default function MenteeLibrary() {
  // Read-only for mentees - they browse and read, but don't curate.
  return <LibraryView />;
}
