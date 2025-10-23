import React from 'react';
import type { RepairGuideResponse, RepairStep } from '../types';
import { CostIcon } from './icons/CostIcon';
import { AvailabilityIcon } from './icons/AvailabilityIcon';
import { ToolIcon } from './icons/ToolIcon';
import { WarningIcon } from './icons/WarningIcon';
import { StepIcon } from './icons/StepIcon';
import { MaterialsIcon } from './icons/MaterialsIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { ExportIcon } from './icons/ExportIcon';
import { ThumbsUpIcon } from './icons/ThumbsUpIcon';
import { ThumbsDownIcon } from './icons/ThumbsDownIcon';
import InteractiveGuideViewer from './InteractiveGuideViewer';
import { PreventativeIcon } from './icons/PreventativeIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import type { BoundingBox } from '../types';
import { MachineDowntimeIcon } from './icons/MachineDowntimeIcon';
import { ManualLaborIcon } from './icons/ManualLaborIcon';


interface RepairGuideProps {
  guide: RepairGuideResponse;
  mediaFileUrl: string | null;
}

const InfoCard: React.FC<{ title: string; content: string; icon: React.ReactNode }> = ({ title, content, icon }) => (
    <div className="bg-gray-800/60 p-4 rounded-lg flex items-start gap-4 border border-gray-700 shadow-lg">
        <div className="flex-shrink-0 text-yellow-400 mt-1">
            {icon}
        </div>
        <div>
            <h3 className="font-bold text-gray-300">{title}</h3>
            <p className="text-yellow-200">{content}</p>
        </div>
    </div>
);


const RepairGuide: React.FC<RepairGuideProps> = ({ guide, mediaFileUrl }) => {
  const { t } = useLanguage();
  const [feedback, setFeedback] = React.useState<'helpful' | 'unhelpful' | null>(null);
  const [activeStepIndex, setActiveStepIndex] = React.useState<number | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editableGuide, setEditableGuide] = React.useState(guide);

  // When the guide prop from the parent changes, update the local editable guide
  React.useEffect(() => {
    setEditableGuide(guide);
    setFeedback(null);
    setActiveStepIndex(null);
    setIsEditing(false); // Disable edit mode when a new guide is loaded
  }, [guide]);

  const hasInteractiveSteps = mediaFileUrl && editableGuide.repairSteps;
  
  const handleAnnotationChange = (stepIndex: number, newBox: BoundingBox | null) => {
    setEditableGuide(prevGuide => {
        if (!prevGuide) return prevGuide;
        const newSteps = [...prevGuide.repairSteps];
        if (newSteps[stepIndex]) {
            // Create a new step object to ensure React detects the change
            newSteps[stepIndex] = {
                ...newSteps[stepIndex],
                boundingBox: newBox || undefined, // Set to new box or remove if null
            };
        }
        return { ...prevGuide, repairSteps: newSteps };
    });
  };

  const handleExport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export the guide.');
      return;
    }

    const listToHtml = (items: string[]) => items.map(item => `<li>${item}</li>`).join('');
    const stepsToHtml = (steps: RepairStep[]) => steps.map(step => `<li>${step.description.replace(/^(\d+\.?\s*|Step\s*\d+[:.]?\s*)/i, '')}</li>`).join('');

    const content = `
      <html>
        <head>
          <title>${t('repairGuideTitle')}</title>
          <style>
            body { 
              font-family: sans-serif; 
              line-height: 1.6; 
              margin: 2rem;
              background-color: #ffffff;
              color: #111827;
            }
            h1, h2, h3 { 
              color: #1f2937;
              border-bottom: 2px solid #f59e0b;
              padding-bottom: 0.5rem;
              margin-top: 1.5rem;
            }
            ul, ol {
              padding-left: 20px;
            }
            li {
              margin-bottom: 0.5rem;
            }
            .section {
              margin-bottom: 1.5rem;
              padding: 1rem;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
            }
            .warnings {
                border-color: #fca5a5;
                background-color: #fef2f2;
            }
            .warnings h3 {
                color: #b91c1c;
                border-color: #fca5a5;
            }
            @media print {
              body {
                margin: 0;
              }
              .no-print {
                display: none;
              }
              .section {
                break-before: page;
                page-break-before: always; /* Fallback for older browsers */
              }
            }
          </style>
        </head>
        <body>
          <h1>${t('repairGuideTitle')}</h1>
          
          <div class="section">
            <h2>${t('diagnosisTitle')}</h2>
            <p>${editableGuide.diagnosis}</p>
          </div>
          
          <div class="section">
            <h2>${t('estimatedCostTitle')}</h2>
            <p>${editableGuide.estimatedCost}</p>
          </div>

          <div class="section">
            <h2>${t('machineDowntimeTitle')}</h2>
            <p>${editableGuide.machineDowntime}</p>
          </div>

          <div class="section">
            <h2>${t('manualLaborTimeTitle')}</h2>
            <p>${editableGuide.manualLaborTime}</p>
          </div>

          <div class="section">
            <h2>${t('partAvailabilityTitle')}</h2>
            <p>${editableGuide.partAvailability}</p>
          </div>
          
          <div class="section">
            <h2>${t('requiredToolsTitle')}</h2>
            <ul>${listToHtml(editableGuide.requiredTools)}</ul>
          </div>
          
          ${editableGuide.requiredMaterials && editableGuide.requiredMaterials.length > 0 ? `
            <div class="section">
              <h2>${t('requiredMaterialsTitle')}</h2>
              <ul>${listToHtml(editableGuide.requiredMaterials)}</ul>
            </div>
          ` : ''}

          <div class="section warnings">
            <h3>${t('safetyWarningsTitle')}</h3>
            <ul>${listToHtml(editableGuide.safetyWarnings)}</ul>
          </div>
          
          ${editableGuide.preventativeMaintenance && editableGuide.preventativeMaintenance.length > 0 ? `
            <div class="section">
              <h2>${t('preventativeMaintenanceTitle')}</h2>
              <ul>${listToHtml(editableGuide.preventativeMaintenance)}</ul>
            </div>
          ` : ''}

          <div class="section">
            <h2>${t('repairStepsTitle')}</h2>
            <ol>${stepsToHtml(editableGuide.repairSteps)}</ol>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="mt-8 bg-gray-900/50 p-4 sm:p-6 rounded-lg shadow-2xl border border-gray-700 animate-fade-in">
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">
          {t('repairGuideTitle')}
        </h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-600 text-yellow-300 bg-gray-700/50 hover:bg-gray-700 transition-colors"
          aria-label={t('exportGuide')}
          title={t('tooltipExport')}
        >
          <ExportIcon className="w-5 h-5" />
          <span className="hidden sm:inline">{t('exportGuide')}</span>
        </button>
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-semibold text-yellow-300 mb-3">{t('diagnosisTitle')}</h3>
        <p className="text-gray-300 bg-gray-800/50 p-4 rounded-md border border-gray-700 shadow-lg">{editableGuide.diagnosis}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <InfoCard title={t('estimatedCostTitle')} content={editableGuide.estimatedCost} icon={<CostIcon className="w-6 h-6" />} />
        <InfoCard title={t('partAvailabilityTitle')} content={editableGuide.partAvailability} icon={<AvailabilityIcon className="w-6 h-6" />} />
        {editableGuide.machineDowntime && <InfoCard title={t('machineDowntimeTitle')} content={editableGuide.machineDowntime} icon={<MachineDowntimeIcon className="w-6 h-6" />} />}
        {editableGuide.manualLaborTime && <InfoCard title={t('manualLaborTimeTitle')} content={editableGuide.manualLaborTime} icon={<ManualLaborIcon className="w-6 h-6" />} />}
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-semibold text-yellow-300 mb-3 flex items-center gap-2">
            <ToolIcon className="w-6 h-6" />
            {t('requiredToolsTitle')}
        </h3>
        <ul className="list-disc list-inside bg-gray-800/50 p-4 rounded-md border border-gray-700 space-y-2 text-gray-300 shadow-lg">
          {editableGuide.requiredTools.map((tool, index) => (
            <li key={index}>{tool}</li>
          ))}
        </ul>
      </div>

      {editableGuide.requiredMaterials && editableGuide.requiredMaterials.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-yellow-300 mb-3 flex items-center gap-2">
              <MaterialsIcon className="w-6 h-6" />
              {t('requiredMaterialsTitle')}
          </h3>
          <ul className="list-disc list-inside bg-gray-800/50 p-4 rounded-md border border-gray-700 space-y-2 text-gray-300 shadow-lg">
            {editableGuide.requiredMaterials.map((material, index) => (
              <li key={index}>{material}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-semibold text-red-400 mb-3 flex items-center gap-2">
            <WarningIcon className="w-6 h-6" />
            {t('safetyWarningsTitle')}
        </h3>
        <ul className="list-disc list-inside bg-red-900/30 p-4 rounded-md border border-red-700/50 space-y-2 text-red-200 shadow-lg">
          {editableGuide.safetyWarnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </div>
      
      {editableGuide.preventativeMaintenance && editableGuide.preventativeMaintenance.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center gap-2">
              <PreventativeIcon className="w-6 h-6" />
              {t('preventativeMaintenanceTitle')}
          </h3>
          <ul className="list-disc list-inside bg-cyan-900/20 p-4 rounded-md border border-cyan-700/50 space-y-2 text-cyan-200 shadow-lg">
            {editableGuide.preventativeMaintenance.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {hasInteractiveSteps && (
        <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-2xl font-semibold text-yellow-300">{t('interactiveGuideTitle')}</h3>
                    <p className="text-gray-400 text-sm">{isEditing ? t('editingGuideDescription') : t('interactiveGuideDescription')}</p>
                </div>
                 <button 
                    onClick={() => setIsEditing(!isEditing)} 
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${isEditing ? 'bg-yellow-400 text-gray-900 border-yellow-400 hover:bg-yellow-500' : 'text-yellow-300 bg-gray-700/50 border-gray-600 hover:bg-gray-700'}`}
                >
                    <EditIcon className="w-5 h-5" />
                    <span className="hidden sm:inline">{isEditing ? t('doneEditing') : t('editAnnotations')}</span>
                </button>
            </div>
            <InteractiveGuideViewer 
                imageUrl={mediaFileUrl!} 
                activeBoundingBox={activeStepIndex !== null ? editableGuide.repairSteps[activeStepIndex].boundingBox : undefined} 
                isEditing={isEditing}
                activeStepIndex={activeStepIndex}
                onAnnotationChange={handleAnnotationChange}
            />
        </div>
      )}

      <div>
        <h3 className="text-xl font-semibold text-yellow-300 mb-3 flex items-center gap-2">
            <StepIcon className="w-6 h-6" />
            {t('repairStepsTitle')}
        </h3>
        <div className="space-y-4 text-gray-300">
          {editableGuide.repairSteps.map((step, index) => {
            const isInteractive = hasInteractiveSteps; // Any step can be made interactive in edit mode
            const isActive = activeStepIndex === index;
            const hasAnnotation = !!step.boundingBox;

            return (
              <div 
                key={index} 
                className={`flex items-start gap-4 p-4 rounded-md border shadow-lg transition-all duration-300 ${isInteractive ? 'cursor-pointer' : ''} ${isActive ? 'bg-yellow-900/50 border-yellow-500 ring-2 ring-yellow-500' : 'bg-gray-800/50 border-gray-700/50 hover:border-yellow-600/50'}`}
                onClick={() => isInteractive && setActiveStepIndex(isActive ? null : index)}
                role={isInteractive ? "button" : undefined}
                aria-pressed={isInteractive ? isActive : undefined}
                tabIndex={isInteractive ? 0 : -1}
                title={isInteractive ? (isEditing ? t('tooltipEditAnnotation') : t('tooltipToggleHighlight')) : undefined}
                onKeyDown={(e) => {
                  if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setActiveStepIndex(isActive ? null : index);
                  }
                }}
              >
                <div className={`flex-shrink-0 text-gray-900 font-bold rounded-full h-8 w-8 flex items-center justify-center mt-1 transition-colors ${isActive ? 'bg-yellow-400' : 'bg-yellow-500'}`}>
                  {index + 1}
                </div>
                <div className="flex-grow">
                  <p className="leading-relaxed">
                    {step.description.replace(/^(\d+\.?\s*|Step\s*\d+[:.]?\s*)/i, '')}
                  </p>
                  {isEditing && isActive && hasAnnotation && (
                     <button 
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent re-selecting the step
                            handleAnnotationChange(index, null);
                        }}
                        className="mt-2 flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                        title={t('clearAnnotation')}
                     >
                        <TrashIcon className="w-4 h-4" />
                        {t('clearAnnotation')}
                     </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Feedback Section */}
      <div className="mt-8 pt-6 border-t-2 border-gray-700/50 text-center">
        <h4 className="text-lg font-semibold text-gray-300 mb-3">{t('feedbackTitle')}</h4>
        {feedback ? (
          <p className="text-green-400">{t('feedbackThanks')}</p>
        ) : (
          <div className="flex justify-center items-center gap-4">
            <button
              onClick={() => setFeedback('helpful')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-green-600/50 text-green-300 bg-green-900/30 hover:bg-green-900/50 transition-colors"
              aria-label={t('feedbackHelpful')}
              title={t('tooltipHelpful')}
            >
              <ThumbsUpIcon className="w-5 h-5" />
              <span>{t('feedbackHelpful')}</span>
            </button>
            <button
              onClick={() => setFeedback('unhelpful')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-red-600/50 text-red-300 bg-red-900/30 hover:bg-red-900/50 transition-colors"
              aria-label={t('feedbackUnhelpful')}
              title={t('tooltipUnhelpful')}
            >
              <ThumbsDownIcon className="w-5 h-5" />
              <span>{t('feedbackUnhelpful')}</span>
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default RepairGuide;