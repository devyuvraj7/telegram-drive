'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { uploadToTelegram } from '@/lib/telegram'
import { AlertCircle, Camera, CameraOff, SwitchCamera } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export default function VideoRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [hasPermission, setHasPermission] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const MIN_RECORDING_TIME = 5 // Minimum recording time in seconds

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  const chunksRef = useRef<Blob[]>([])

  const getAvailableDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(device => device.kind === 'videoinput')
      setDevices(videoDevices)
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId)
      }
    } catch (error) {
      console.error('Error getting devices:', error)
      setPermissionError('Failed to get available cameras. Please check your permissions.')
    }
  }, [selectedDeviceId])

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setHasPermission(true)
      stream.getTracks().forEach(track => track.stop())
      await getAvailableDevices()
    } catch (error) {
      console.error('Error requesting permission:', error)
      setPermissionError('Failed to get camera and microphone permissions.')
    }
  }, [getAvailableDevices])

  useEffect(() => {
    requestPermission()
    navigator.mediaDevices.addEventListener('devicechange', getAvailableDevices)
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      navigator.mediaDevices.removeEventListener('devicechange', getAvailableDevices)
    }
  }, [getAvailableDevices, requestPermission])

  const startRecording = useCallback(async () => {
    try {
      await setupMediaStream()
      
      const options = { mimeType: 'video/webm;codecs=vp8,opus' }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn(`${options.mimeType} is not supported, using default codec`)
      }

      const mediaRecorder = new MediaRecorder(streamRef.current!, options)
      mediaRecorderRef.current = mediaRecorder

      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        setRecordedBlob(blob)

        console.log('Recorded Blob:', blob);
        console.log('Blob type:', blob.type);
        console.log('Blob size:', blob.size);

        // Stop all tracks
        streamRef.current?.getTracks().forEach(track => track.stop())
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
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

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  const switchCamera = useCallback(async () => {
    if (devices.length < 2) return

    setIsSwitchingCamera(true)
    const currentIndex = devices.findIndex(device => device.deviceId === selectedDeviceId)
    const nextIndex = (currentIndex + 1) % devices.length
    const nextDeviceId = devices[nextIndex].deviceId

    try {
      if (isRecording) {
        // Pause current recording
        mediaRecorderRef.current?.pause()
      }

      // Setup new media stream
      setSelectedDeviceId(nextDeviceId)
      await setupMediaStream()

      if (isRecording) {
        // Resume recording with new stream
        mediaRecorderRef.current?.resume()
      }
    } catch (error) {
      console.error('Error switching camera:', error)
      setPermissionError('Failed to switch camera. Please try again.')
    } finally {
      setIsSwitchingCamera(false)
    }
  }, [devices, selectedDeviceId, isRecording])

  const setupMediaStream = async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }

    const constraints: MediaStreamConstraints = {
      video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      audio: true
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
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

    return stream
  }


  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center w-full max-w-md mx-auto p-4 bg-white rounded-lg shadow-lg"
    >
      {!hasPermission ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button>Request Camera Permission</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Camera Permission Required</DialogTitle>
              <DialogDescription>
                We need your permission to access the camera and microphone. Please click "Allow" when prompted.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={requestPermission}>Request Permission</Button>
          </DialogContent>
        </Dialog>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row justify-between w-full mb-4 gap-2">
            <Select value={selectedDeviceId || undefined} onValueChange={setSelectedDeviceId}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Select a camera" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${devices.indexOf(device) + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={switchCamera} disabled={devices.length < 2 || isSwitchingCamera} className="w-full sm:w-auto">
              <SwitchCamera className="mr-2 h-4 w-4" /> Switch Camera
            </Button>
          </div>

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
                  <Button onClick={startRecording} disabled={!selectedDeviceId} className="w-full">
                    <Camera className="mr-2 h-4 w-4" /> Start Recording
                  </Button>
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
                    className="w-full"
                  >
                    <CameraOff className="mr-2 h-4 w-4" /> Stop Recording {recordingTime < MIN_RECORDING_TIME && `(${MIN_RECORDING_TIME - recordingTime}s)`}
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
                  <Button onClick={handleUpload} disabled={isUploading} className="w-full">
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
              className="mt-4 text-center"
            >
              Recording complete ({formatTime(recordingTime)}). Click "Upload Recording" to save.
            </motion.p>
          )}
        </>
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

