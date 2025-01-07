'use client'

import React, { useState, useEffect } from 'react'
import { getFiles } from '@/lib/telegram'
import { AlertCircle, Loader2, FileIcon, FolderIcon, ChevronLeft, Download } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'

interface File {
  id: string
  url: string
  type: string
  name: string
  preview?: string
  parentId?: string
}

interface Folder {
  id: string
  name: string
  parentId?: string
}

type Item = File | Folder

export default function FileViewer() {
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentFolder, setCurrentFolder] = useState<string | undefined>(undefined)
  const [folderHistory, setFolderHistory] = useState<string[]>([])

  useEffect(() => {
    fetchItems(currentFolder)
  }, [currentFolder])

  const fetchItems = async (folderId?: string) => {
    try {
      setIsLoading(true)
      setError(null)
      const fetchedItems = await getFiles(folderId)
      setItems(fetchedItems)
    } catch (error) {
      console.error('Error fetching items:', error)
      setError('Failed to fetch items. Please try again later.')
      toast.error('Failed to fetch items')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFolderClick = (folderId: string) => {
    setFolderHistory(prev => [...prev, currentFolder || ''])
    setCurrentFolder(folderId)
  }

  const handleBackClick = () => {
    const previousFolder = folderHistory.pop()
    setFolderHistory([...folderHistory])
    setCurrentFolder(previousFolder)
  }

  const renderItem = (item: Item) => {
    if ('url' in item) {
      // It's a file
      if (item.type.startsWith('image/')) {
        return (
          <div className="relative group">
            <img src={item.url} alt={item.name} className="w-full h-auto rounded-lg" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-50 rounded-lg">
              <Button variant="secondary" size="sm" onClick={() => window.open(item.url, '_blank')}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        )
      } else if (item.type.startsWith('video/')) {
        return (
          <div className="relative group">
            <video controls className="w-full h-auto rounded-lg">
              <source src={item.url} type={item.type} />
              Your browser does not support the video tag.
            </video>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-50 rounded-lg">
              <Button variant="secondary" size="sm" onClick={() => window.open(item.url, '_blank')}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        )
      } else if (item.type.startsWith('audio/')) {
        return (
          <div className="flex flex-col items-center justify-center bg-gray-100 rounded-lg p-4">
            <audio controls className="w-full mb-2">
              <source src={item.url} type={item.type} />
              Your browser does not support the audio tag.
            </audio>
            <Button variant="secondary" size="sm" onClick={() => window.open(item.url, '_blank')}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        )
      } else {
        return (
          <div className="flex flex-col items-center justify-center bg-gray-100 rounded-lg p-4">
            {item.preview ? (
              <img src={item.preview} alt={item.name} className="w-full h-auto rounded-lg mb-2" />
            ) : (
              <FileIcon className="w-16 h-16 text-gray-400 mb-2" />
            )}
            <p className="text-sm text-gray-600 mb-2">{item.name}</p>
            <Button variant="secondary" size="sm" onClick={() => window.open(item.url, '_blank')}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        )
      }
    } else {
      // It's a folder
      return (
        <div
          className="flex flex-col items-center justify-center bg-gray-100 rounded-lg p-4 cursor-pointer hover:bg-gray-200 transition-colors"
          onClick={() => handleFolderClick(item.id)}
        >
          <FolderIcon className="w-16 h-16 text-yellow-500 mb-2" />
          <p className="text-sm text-gray-600">{item.name}</p>
        </div>
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="p-4 bg-red-100 text-red-700 rounded-md flex items-center">
          <AlertCircle className="mr-2 h-4 w-4" />
          {error}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center text-gray-500 mt-8">
        No items in this folder.
      </div>
    )
  }

  return (
    <div>
      {currentFolder && (
        <Button variant="ghost" onClick={handleBackClick} className="mb-4">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.id} className="border rounded-lg p-4">
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  )
}

