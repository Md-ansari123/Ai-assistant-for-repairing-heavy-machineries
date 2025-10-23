import React, { useState, useRef, useEffect } from 'react';
import type { BoundingBox } from '../types';

interface InteractiveGuideViewerProps {
    imageUrl: string;
    activeBoundingBox?: BoundingBox;
    isEditing: boolean;
    activeStepIndex: number | null;
    onAnnotationChange: (stepIndex: number, newBox: BoundingBox | null) => void;
}

const InteractiveGuideViewer: React.FC<InteractiveGuideViewerProps> = ({ 
    imageUrl, 
    activeBoundingBox,
    isEditing,
    activeStepIndex,
    onAnnotationChange
}) => {
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const imageRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [currentBox, setCurrentBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

    useEffect(() => {
        const img = imageRef.current;
        if (!img) return;

        const updateSize = () => {
            setImageSize({ width: img.clientWidth, height: img.clientHeight });
        };

        const handleResize = () => {
            updateSize();
        };

        img.addEventListener('load', updateSize);
        window.addEventListener('resize', handleResize);

        if (img.complete && img.naturalWidth > 0) {
            updateSize();
        }

        return () => {
            img.removeEventListener('load', updateSize);
            window.removeEventListener('resize', handleResize);
        };
    }, []);
    
    const canEdit = isEditing && activeStepIndex !== null;

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!canEdit || !containerRef.current) return;
        e.preventDefault();
        setIsDrawing(true);
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setStartPoint({ x, y });
        setCurrentBox({ x, y, width: 0, height: 0 });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDrawing || !startPoint || !containerRef.current) return;
        e.preventDefault();
        const rect = containerRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const newBox = {
            x: Math.min(startPoint.x, currentX),
            y: Math.min(startPoint.y, currentY),
            width: Math.abs(currentX - startPoint.x),
            height: Math.abs(currentY - startPoint.y),
        };
        setCurrentBox(newBox);
    };

    const resetDrawing = () => {
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentBox(null);
    };

    const handleMouseUp = () => {
        if (!isDrawing || !currentBox || activeStepIndex === null || !imageSize.width || !imageSize.height) {
            resetDrawing();
            return;
        }

        const normalizedBox: BoundingBox = {
            x: currentBox.x / imageSize.width,
            y: currentBox.y / imageSize.height,
            width: currentBox.width / imageSize.width,
            height: currentBox.height / imageSize.height,
        };
        
        // Prevent creating tiny boxes from accidental clicks
        if (normalizedBox.width > 0.01 && normalizedBox.height > 0.01) {
            onAnnotationChange(activeStepIndex, normalizedBox);
        }

        resetDrawing();
    };

    const boxStyle: React.CSSProperties = activeBoundingBox && imageSize.width > 0 ? {
        position: 'absolute',
        left: `${activeBoundingBox.x * imageSize.width}px`,
        top: `${activeBoundingBox.y * imageSize.height}px`,
        width: `${activeBoundingBox.width * imageSize.width}px`,
        height: `${activeBoundingBox.height * imageSize.height}px`,
        opacity: 1,
        transform: 'translateZ(0)', // Promote to its own layer for smoother animations
    } : { opacity: 0, display: 'none' };
    
    const drawingBoxStyle: React.CSSProperties = isDrawing && currentBox ? {
        position: 'absolute',
        left: `${currentBox.x}px`,
        top: `${currentBox.y}px`,
        width: `${currentBox.width}px`,
        height: `${currentBox.height}px`,
        border: '2px dashed #facc15',
        backgroundColor: 'rgba(250, 204, 21, 0.2)',
        pointerEvents: 'none',
    } : { display: 'none' };

    return (
        <div 
            ref={containerRef}
            className={`relative w-full max-w-full mx-auto border-2 border-gray-700 rounded-lg overflow-hidden shadow-lg bg-gray-900 ${canEdit ? 'cursor-crosshair' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={resetDrawing} // Reset if mouse leaves the container while drawing
        >
            <img 
                ref={imageRef}
                src={imageUrl} 
                alt="Repair context" 
                className="block w-full h-auto max-h-[70vh] object-contain select-none"
                draggable="false"
            />
            <div 
                className="border-4 border-yellow-400 bg-yellow-400/30 rounded-md transition-all duration-300 ease-in-out shadow-2xl pointer-events-none"
                style={boxStyle}
                aria-hidden="true"
            />
            <div style={drawingBoxStyle} aria-hidden="true" />
        </div>
    );
};

export default InteractiveGuideViewer;