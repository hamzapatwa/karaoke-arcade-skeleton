import React, { useState } from 'react';

export default function SongUpload({ onSongUploaded, apiBase }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (file) => {
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file (MP3 or WAV)');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setUploadProgress(50);

      // Start analysis
      const analyzeResponse = await fetch(`${apiBase}/analyze/${result.track_id}`, {
        method: 'POST'
      });

      const analyzeResult = await analyzeResponse.json();

      if (analyzeResult.error) {
        throw new Error(analyzeResult.error);
      }

      setUploadProgress(75);

      if (analyzeResult.status === 'ready') {
        setUploadProgress(100);
        onSongUploaded(result.track_id, result.filename);
      } else if (analyzeResult.job_id) {
        // Poll for completion
        await pollAnalysisStatus(analyzeResult.job_id, result.track_id, result.filename);
      }

    } catch (error) {
      console.error('Upload failed:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const pollAnalysisStatus = async (jobId, trackId, filename) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${apiBase}/analyze/status/${jobId}`);
        const status = await response.json();

        if (status.status === 'completed') {
          clearInterval(pollInterval);
          setUploadProgress(100);
          onSongUploaded(trackId, filename);
        } else if (status.status === 'error') {
          clearInterval(pollInterval);
          throw new Error('Analysis failed');
        }
      } catch (error) {
        clearInterval(pollInterval);
        console.error('Status check failed:', error);
      }
    }, 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="song-upload">
      <h3>Upload New Song</h3>

      {isUploading ? (
        <div className="upload-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p>Processing... {uploadProgress}%</p>
        </div>
      ) : (
        <div
          className="upload-area"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <p>Drop audio file here or click to browse</p>
          <input
            type="file"
            accept="audio/mpeg, audio/wav"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            id="file-input"
          />
          <label htmlFor="file-input" className="retro-button">
            Choose File
          </label>
        </div>
      )}
    </div>
  );
}