'use client'

import { useState, useCallback } from 'react'
import MediaUploader from '@/components/MediaUploader'
import FileViewer from '@/components/FileViewer'
import { Toaster } from 'react-hot-toast'

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [currentFolder, setCurrentFolder] = useState<string | undefined>(undefined)

  const handleFileUploaded = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  const handleFolderChange = useCallback((folderId: string | undefined) => {
    setCurrentFolder(folderId)
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Toaster position="top-right" />
      <h1 className="text-4xl font-bold mb-8">Telegram Drive</h1>
      <div className="w-full max-w-4xl">
        <MediaUploader onFileUploaded={handleFileUploaded} currentFolder={currentFolder} />
        <div className="mt-12">
          {/* <FileViewer key={refreshTrigger} onFolderChange={handleFolderChange} /> */}
        </div>
      </div>
    </main>
  )
}

