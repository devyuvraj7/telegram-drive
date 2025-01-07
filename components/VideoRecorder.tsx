'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { uploadToTelegram } from '@/lib/telegram'
import { AlertCircle } from 'lucide-react'

export default function VideoRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const MIN_RECORDING_TIME = 5 // Minimum recording time in seconds

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      streamRef.current = stream
      const hasAudioTrack = stream.getAudioTracks().length > 0;
      const hasVideoTrack = stream.getVideoTracks().length > 0;
      if (!hasAudioTrack || !hasVideoTrack) {
        throw new Error(`Missing ${!hasAudioTrack ? 'audio' : 'video'} track`);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true // Mute to prevent feedback
      }

      const options = { mimeType: 'video/webm;codecs=vp8,opus' }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn(`${options.mimeType} is not supported, using default codec`)
      }

      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder

      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        setRecordedBlob(blob)

        console.log('Recorded Blob:', blob);
        console.log('Blob type:', blob.type);
        console.log('Blob size:', blob.size);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)
      setPermissionError(null)

      timerRef.current = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1)
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      setPermissionError('Failed to start recording. Please check your camera and microphone permissions.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    setIsRecording(false)
  }, [])

  const handleUpload = async () => {
    if (recordedBlob) {
      setIsUploading(true)
      setUploadProgress(0)
      try {
        const fileId = await uploadToTelegram(recordedBlob, `video_${Date.now()}.webm`, undefined, (progress: number) => {
          setUploadProgress(progress)
        });
        console.log('Video uploaded to Telegram, file ID:', fileId);
        setRecordedBlob(null);
        setRecordingTime(0);
      } catch (error) {
        console.error('Error uploading to Telegram:', error);
        alert('Failed to upload video. Please try again.');
      }
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg"
    >
      <motion.div 
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full aspect-video mb-4 bg-gray-200 rounded-lg overflow-hidden"
      >
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </motion.div>
      
      <div className="flex flex-wrap justify-center gap-4 mb-4">
        <AnimatePresence mode="wait">
          {!isRecording && !recordedBlob && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Button onClick={startRecording}>Start Recording</Button>
            </motion.div>
          )}
          {isRecording && (
            <motion.div
              key="stop"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Button 
                onClick={stopRecording} 
                variant="destructive" 
                disabled={recordingTime < MIN_RECORDING_TIME}
              >
                Stop Recording {recordingTime < MIN_RECORDING_TIME && `(${MIN_RECORDING_TIME - recordingTime}s)`}
              </Button>
            </motion.div>
          )}
          {recordedBlob && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Button onClick={handleUpload} disabled={isUploading}>
                {isUploading ? 'Uploading...' : 'Upload Recording'}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {isRecording && (
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-full h-2 bg-blue-500 rounded-full mb-4"
        />
      )}
      
      {isUploading && (
        <div className="w-full mb-4">
          <Progress value={uploadProgress} className="w-full" />
        </div>
      )}
      
      {isRecording && (
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4"
        >
          Recording Time: {formatTime(recordingTime)}
        </motion.p>
      )}
      
      {recordedBlob && !isUploading && (
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4"
        >
          Recording complete ({formatTime(recordingTime)}). Click "Upload Recording" to save.
        </motion.p>
      )}
      
      {permissionError && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-4 bg-red-100 text-red-700 rounded-md flex items-center"
        >
          <AlertCircle className="mr-2" />
          {permissionError}
        </motion.div>
      )}
    </motion.div>
  )
}

