import { useCallback, useState } from 'react';
import './ImageDropZone.css';

interface ImageDropZoneProps {
  onImageSelected: (file: File) => void;
  disabled?: boolean;
}

/**
 * 画像のドラッグ＆ドロップまたはファイル選択を受け付けるコンポーネント。
 */
export default function ImageDropZone({ onImageSelected, disabled = false }: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find(f => f.type.startsWith('image/'));

      if (imageFile) {
        onImageSelected(imageFile);
      }
    },
    [disabled, onImageSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onImageSelected(file);
      }
    },
    [onImageSelected]
  );

  return (
    <div
      className={`drop-zone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="image-drop-zone"
    >
      <div className="drop-zone-content">
        <div className="drop-zone-icon">📷</div>
        <p className="drop-zone-title">画像をドロップするか、クリックして選択</p>
        <p className="drop-zone-subtitle">猫の写真をアップロードしてください</p>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="file-input"
          disabled={disabled}
          aria-label="画像アップロード"
          data-testid="image-input"
        />
      </div>
    </div>
  );
}
