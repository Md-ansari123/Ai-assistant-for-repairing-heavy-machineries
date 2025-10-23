const CACHE_NAME = 'jharkhand-repair-ai-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/metadata.json',
  '/services/geminiService.ts',
  '/contexts/LanguageContext.tsx',
  '/components/Header.tsx',
  '/components/ProblemInputForm.tsx',
  '/components/RepairGuide.tsx',
  '/components/History.tsx',
  '/components/ChatButton.tsx',
  '/components/Chatbot.tsx',
  '/components/CameraCapture.tsx',
  '/components/SpeechToTextInput.tsx',
  '/components/VideoGenerationModal.tsx',
  '/components/InteractiveGuideViewer.tsx',
  '/components/LiveArAnalysis.tsx',
  '/components/icons/MiningTruckIcon.tsx',
  '/components/icons/TranslateIcon.tsx',
  '/components/icons/HistoryIcon.tsx',
  '/components/icons/LoadingSpinner.tsx',
  '/components/icons/CostIcon.tsx',
  '/components/icons/AvailabilityIcon.tsx',
  '/components/icons/ToolIcon.tsx',
  '/components/icons/WarningIcon.tsx',
  '/components/icons/StepIcon.tsx',
  '/components/icons/MaterialsIcon.tsx',
  '/components/icons/ExportIcon.tsx',
  '/components/icons/ThumbsUpIcon.tsx',
  '/components/icons/ThumbsDownIcon.tsx',
  '/components/icons/PreventativeIcon.tsx',
  '/components/icons/EditIcon.tsx',
  '/components/icons/TrashIcon.tsx',
  '/components/icons/MachineDowntimeIcon.tsx',
  '/components/icons/ManualLaborIcon.tsx',
  '/components/icons/CameraIcon.tsx',
  '/components/icons/VideoIcon.tsx',
  '/components/icons/FlashOnIcon.tsx',
  '/components/icons/FlashOffIcon.tsx',
  '/components/icons/SettingsIcon.tsx',
  '/components/icons/RetakeIcon.tsx',
  '/components/icons/CheckIcon.tsx',
  '/components/icons/StopIcon.tsx',
  '/components/icons/SmallSpinner.tsx',
  '/components/icons/ArIcon.tsx',
  '/components/icons/ArrowDownIcon.tsx',
  '/components/icons/ArrowLeftIcon.tsx',
  '/components/icons/ArrowRightIcon.tsx',
  '/components/icons/ArrowUpIcon.tsx',
  '/components/icons/ZoomInIcon.tsx',
  '/components/icons/ZoomOutIcon.tsx',
  '/components/icons/ChatIcon.tsx',
  '/components/icons/SendIcon.tsx',
  '/components/icons/CloseIcon.tsx',
  '/components/icons/MicrophoneIcon.tsx',
  '/translations/en.json',
  '/translations/hi.json',
  '/translations/bn.json',
  '/translations/te.json',
  '/translations/ta.json',
  '/translations/kn.json',
  '/translations/ur.json',
  '/translations/mr.json',
  '/translations/gu.json',
  '/translations/en_in.json',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200) {
              return response;
            }
            
            // We don't cache API requests from genai
            if(event.request.url.includes('generativelanguage.googleapis.com')) {
                return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
