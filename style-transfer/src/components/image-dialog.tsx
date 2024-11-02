"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useDropzone } from "react-dropzone"
import { Upload, X } from "lucide-react"

interface ImageUploadingDialogProps {
  onImageUpload: (file: File) => void
  children: React.ReactNode
}

export function ImageUploadDialog({
  onImageUpload,
  children,
}: ImageUploadingDialogProps) {
  const [open, setOpen] = useState<boolean>(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0]

      setSelectedFile(file)
      setPreview(URL.createObjectURL(file))
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
    },
    multiple: false,
  })

  const handleConfirm = () => {
    if (selectedFile) {
      onImageUpload(selectedFile)
      setOpen(false)
      setPreview(null)
      setSelectedFile(null)
    }
  }

  const handleCancel = () => {
    setOpen(false)
    setPreview(null)
    setSelectedFile(null)
  }

  return (
    <>
      <div onClick={() => setOpen(true)}>{children}</div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload Image</DialogTitle>
            <DialogDescription>
              Upload an image to transform it into Monet&apos;s style. Supported
              formats: JPEG, PNG, WebP
            </DialogDescription>
          </DialogHeader>

          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
              transition-colors duration-200 min-h-[200px] flex items-center justify-center
              ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25"
              }
              ${preview ? "border-muted" : ""}
            `}
          >
            <input {...getInputProps()} />
            {preview ? (
              <div className="relative w-full">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-[300px] mx-auto rounded-lg"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreview(null)
                    setSelectedFile(null)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <div className="space-y-2">
                  <p className="font-medium">
                    Drop your image here or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Maximum file size: 10MB
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!selectedFile}>
              Transform Image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
