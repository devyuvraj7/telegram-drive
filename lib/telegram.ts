import axios, { AxiosError } from 'axios'

const TELEGRAM_BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  throw new Error('Telegram bot token or chat ID is missing. Please check your environment variables.')
}

interface TelegramFile {
  id: string
  url: string
  type: string
  name: string
  preview?: string
  parentId?: string
}

interface TelegramFolder {
  id: string
  name: string
  parentId?: string
}

export async function uploadToTelegram(
  file: File | Blob,
  fileName: string,
  parentId?: string,
  onProgress?: (progress: number) => void
): Promise<TelegramFile> {
  const formData = new FormData()
  formData.append('chat_id', TELEGRAM_CHAT_ID as any)
  formData.append('document', file, fileName)
  if (parentId) {
    formData.append('caption', `parent:${parentId}`)
  }

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress && onProgress(percentCompleted)
          }
        },
      }
    )

    if (response.data.ok) {
      const fileId = response.data.result.document.file_id
      const fileUrl = await getFileUrl(fileId)
      return {
        id: fileId,
        url: fileUrl,
        type: response.data.result.document.mime_type,
        name: fileName,
        parentId,
      }
    } else {
      throw new Error(response.data.description || 'Failed to upload file to Telegram')
    }
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error('Axios error:', error.response?.data || error.message)
      throw new Error(`Failed to upload file: ${error.response?.data?.description || error.message}`)
    }
    console.error('Error uploading to Telegram:', error)
    throw new Error('An unexpected error occurred while uploading the file')
  }
}

async function getFileUrl(fileId: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
    )

    if (response.data.ok) {
      const filePath = response.data.result.file_path
      return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`
    } else {
      throw new Error(response.data.description || 'Failed to get file URL from Telegram')
    }
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error('Axios error:', error.response?.data || error.message)
      throw new Error(`Failed to get file URL: ${error.response?.data?.description || error.message}`)
    }
    console.error('Error getting file URL:', error)
    throw new Error('An unexpected error occurred while getting the file URL')
  }
}

export async function createFolder(name: string, parentId?: string): Promise<TelegramFolder> {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: `folder:${name}${parentId ? `:${parentId}` : ''}`,
      }
    )

    if (response.data.ok) {
      return {
        id: response.data.result.message_id.toString(),
        name,
        parentId,
      }
    } else {
      throw new Error(response.data.description || 'Failed to create folder')
    }
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error('Axios error:', error.response?.data || error.message)
      throw new Error(`Failed to create folder: ${error.response?.data?.description || error.message}`)
    }
    console.error('Error creating folder:', error)
    throw new Error('An unexpected error occurred while creating the folder')
  }
}

export async function getFiles(parentId?: string): Promise<(TelegramFile | TelegramFolder)[]> {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`,
      {
        params: {
          allowed_updates: ['message'],
          limit: 100,
        }
      }
    )

    if (response.data.ok) {
      const items = await Promise.all(response.data.result
        .filter((update: any) => update.message && (update.message.document || update.message.text))
        .map(async (update: any) => {
          const message = update.message;
          if (message.document) {
            const file = message.document;
            const fileUrl = await getFileUrl(file.file_id);
            const caption = message.caption || '';
            const fileParentId = caption.startsWith('parent:') ? caption.split(':')[1] : undefined;
            
            if (parentId && fileParentId !== parentId) {
              return null;
            }

            return {
              id: file.file_id,
              url: fileUrl,
              type: file.mime_type || 'application/octet-stream',
              name: file.file_name || `file_${file.file_id}`,
              preview: file.thumb ? await getFileUrl(file.thumb.file_id) : undefined,
              parentId: fileParentId,
            };
          } else if (message.text && message.text.startsWith('folder:')) {
            const [, folderName, folderParentId] = message.text.split(':');
            
            if (parentId && folderParentId !== parentId) {
              return null;
            }

            return {
              id: message.message_id.toString(),
              name: folderName,
              parentId: folderParentId,
            };
          }
          return null;
        }));

      return items.filter(Boolean);
    } else {
      throw new Error(response.data.description || 'Failed to get files and folders from Telegram')
    }
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error('Axios error:', error.response?.data || error.message)
      throw new Error(`Failed to get files and folders: ${error.response?.data?.description || error.message}`)
    }
    console.error('Error getting files and folders:', error)
    throw new Error('An unexpected error occurred while fetching files and folders')
  }
}

