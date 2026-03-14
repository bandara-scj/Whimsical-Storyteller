import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, BookOpen, Wand2, Loader2, Save, X, Library, VolumeX, Volume2, RotateCcw } from "lucide-react";
import { BookPage } from "./components/BookPage";
import { generateStoryStart, generateNextSegment, generateIllustration, generateNarration, processVoiceInput, generateStoryEnding } from "./services/gemini";
import { playAudio } from "./utils/audio";

type StorySegment = {
  story: string;
  image: string;
  options: string[];
  moodColor?: string;
};

type SavedStory = {
  id: string;
  title: string;
  theme: string;
  characterDesc: string;
  history: StorySegment[];
  currentIndex: number;
  finalSentence?: string;
  date: string;
};

export default function App() {
  const [status, setStatus] = useState<'idle' | 'generating_start' | 'opening_book' | 'reading' | 'generating_end' | 'showing_end' | 'closing_book'>('idle');
  const [theme, setTheme] = useState("a brave little fox who wants to touch the moon");
  const [storyHistory, setStoryHistory] = useState<StorySegment[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isReading, setIsReading] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");
  const [finalSentence, setFinalSentence] = useState("");
  const [characterDesc, setCharacterDesc] = useState("");
  const [isGeneratingNext, setIsGeneratingNext] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isNarratorEnabled, setIsNarratorEnabled] = useState(true);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem('whimsical_stories');
    if (saved) {
      try {
        setSavedStories(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const saveStory = () => {
    if (storyHistory.length === 0) return;
    
    const now = new Date().toISOString();
    let updated: SavedStory[];

    if (currentStoryId) {
      // Update existing story
      updated = savedStories.map(s => 
        s.id === currentStoryId 
          ? { ...s, history: storyHistory, currentIndex, finalSentence: status === 'showing_end' ? finalSentence : undefined, date: now }
          : s
      );
    } else {
      // Create new story
      const newId = Date.now().toString();
      const newStory: SavedStory = {
        id: newId,
        title: storyTitle || "A Magical Tale",
        theme,
        characterDesc,
        history: storyHistory,
        currentIndex: currentIndex,
        finalSentence: status === 'showing_end' ? finalSentence : undefined,
        date: now
      };
      setCurrentStoryId(newId);
      updated = [newStory, ...savedStories];
    }

    setSavedStories(updated);
    localStorage.setItem('whimsical_stories', JSON.stringify(updated));
    showToast("Progress saved to your library!");
  };

  const loadStory = (story: SavedStory) => {
    setStoryTitle(story.title);
    setTheme(story.theme);
    setCharacterDesc(story.characterDesc);
    setStoryHistory(story.history);
    setCurrentIndex(story.currentIndex ?? 0);
    setCurrentStoryId(story.id);
    setShowLibrary(false);
    
    if (story.finalSentence) {
      setFinalSentence(story.finalSentence);
      setStatus('showing_end');
    } else {
      setFinalSentence("");
      setStatus('opening_book');
    }
    
    if (bgMusicRef.current) {
      bgMusicRef.current.volume = 0.05;
      bgMusicRef.current.play().catch(e => console.log("Audio play failed:", e));
    }
  };

  const particleColors = [
    "bg-white",
    "bg-blue-100",
    "bg-slate-100",
    "bg-indigo-100",
    "bg-yellow-50"
  ];

  const currentSegment = currentIndex >= 0 ? storyHistory[currentIndex] : null;
  const dynamicColor = currentSegment?.moodColor || "#1e3a8a"; // Default deep blue
  const currentParticleColor = currentIndex >= 0 ? particleColors[currentIndex % particleColors.length] : particleColors[0];

  const playNarration = async (storyText: string, options?: string[], isFirstPage: boolean = false, forcePlay: boolean = false) => {
    if (!isNarratorEnabled && !forcePlay) return;
    
    setIsReading(true);
    setAudioProgress(0);
    try {
      let textToRead = storyText;
      
      if (isFirstPage && theme) {
        textToRead = `Greetings, my fellow readers! Today we will tell a story about ${theme}. ${storyText}`;
      }

      if (options && options.length > 0) {
        let optionsText = "What do you think will happen next? ";
        if (options.length === 1) {
          optionsText += `Will they ${options[0]}?`;
        } else if (options.length === 2) {
          optionsText += `Will they ${options[0]}, or ${options[1]}?`;
        } else {
          const last = options[options.length - 1];
          const rest = options.slice(0, -1).join(", ");
          optionsText += `Will they ${rest}, or ${last}?`;
        }
        textToRead = `${storyText} ${optionsText}`;
      }

      const audioData = await generateNarration(textToRead);
      const source = await playAudio(audioData);
      audioSourceRef.current = source;
      
      durationRef.current = source.buffer?.duration || 0;
      startTimeRef.current = Date.now();
      
      const updateProgress = () => {
        if (!audioSourceRef.current) return;
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const progress = Math.min(1, elapsed / durationRef.current);
        setAudioProgress(progress);
        
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(updateProgress);
        }
      };
      animationRef.current = requestAnimationFrame(updateProgress);
      
      source.onended = () => {
        setIsReading(false);
        setAudioProgress(0);
        audioSourceRef.current = null;
        cancelAnimationFrame(animationRef.current);
      };
    } catch (err) {
      console.error("Failed to read aloud:", err);
      setIsReading(false);
      setAudioProgress(0);
    }
  };

  const handleStart = async () => {
    setStatus('generating_start');
    setCurrentStoryId(null);
    try {
      const { title, story, options, imagePrompt, moodColor, characterDescription } = await generateStoryStart(theme);
      setCharacterDesc(characterDescription || "");
      const image = await generateIllustration(imagePrompt, characterDescription);
      
      setStoryTitle(title || "A Magical Tale");
      setStoryHistory([{ story, image, options, moodColor }]);
      setCurrentIndex(0);
      setStatus('opening_book');

      if (bgMusicRef.current) {
        bgMusicRef.current.volume = 0.05;
        bgMusicRef.current.play().catch(e => console.log("Audio play failed:", e));
      }
    } catch (err) {
      console.error("Failed to start story:", err);
      showToast("Oops! The magic wand fizzled. Please try again.");
      setStatus('idle');
    }
  };

  const handleNextSegment = async (choice: string) => {
    if (isGeneratingNext) return;
    setIsGeneratingNext(true);
    setSelectedOption(choice);
    stopNarration();
    
    try {
      const currentSegment = storyHistory[currentIndex];
      const { story, options, imagePrompt, moodColor } = await generateNextSegment(currentSegment.story, choice);
      const image = await generateIllustration(imagePrompt, characterDesc);
      
      setStoryHistory(prev => [...prev, { story, image, options, moodColor }]);
      setCurrentIndex(prev => prev + 1);
      playNarration(story, options);
    } catch (err) {
      console.error("Failed to generate next segment:", err);
      showToast("Oops! The story got stuck. Please try choosing again.");
    } finally {
      setIsGeneratingNext(false);
      setSelectedOption(null);
    }
  };

  const handleEndStory = async () => {
    if (isGeneratingNext) return;
    setIsGeneratingNext(true);
    stopNarration();
    setStatus('generating_end');
    
    try {
      const currentSegment = storyHistory[currentIndex];
      const ending = await generateStoryEnding(currentSegment.story);
      setFinalSentence(ending);
      setStatus('showing_end');
      playNarration(ending);
    } catch (err) {
      console.error("Failed to generate ending:", err);
      setStatus('reading');
    } finally {
      setIsGeneratingNext(false);
    }
  };

  const handleVoiceInput = async (audioBlob: Blob) => {
    if (status !== 'reading') return;
    setIsProcessingVoice(true);
    try {
      const currentSegment = storyHistory[currentIndex];
      const result = await processVoiceInput(audioBlob, currentSegment.options);
      
      if (result.choice) {
        // We got a choice, proceed to next segment
        await handleNextSegment(result.choice);
      } else {
        showToast("I didn't quite catch that. Could you try again?");
      }
    } catch (err) {
      console.error("Failed to process voice:", err);
      showToast("Oops! The magic ears didn't work. Please try again or tap an option.");
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleReadAloud = async () => {
    if (isReading) {
      stopNarration();
      return;
    }
    
    const currentSegment = storyHistory[currentIndex];
    playNarration(currentSegment.story, currentSegment.options, currentIndex === 0, true);
  };

  const stopNarration = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setIsReading(false);
    setAudioProgress(0);
    cancelAnimationFrame(animationRef.current);
  };

  const handleStartOver = () => {
    stopNarration();
    setStatus('idle');
    setStoryHistory([]);
    setCurrentIndex(-1);
    setCurrentStoryId(null);
    setTheme("");
    setFinalSentence("");
    setCharacterDesc("");
    if (bgMusicRef.current) {
      bgMusicRef.current.pause();
      bgMusicRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    if (status === 'opening_book') {
      const timer = setTimeout(() => {
        setStatus('reading');
        if (storyHistory.length > 0 && currentIndex >= 0) {
          playNarration(storyHistory[currentIndex].story, storyHistory[currentIndex].options, currentIndex === 0);
        }
      }, 2500); // Wait for cover animation before showing page
      return () => clearTimeout(timer);
    } else if (status === 'closing_book') {
      const timer = setTimeout(() => {
        setStatus('idle');
        setStoryHistory([]);
        setCurrentIndex(-1);
        setCurrentStoryId(null);
        setTheme("");
        setFinalSentence("");
        setCharacterDesc("");
        if (bgMusicRef.current) {
          bgMusicRef.current.pause();
          bgMusicRef.current.currentTime = 0;
        }
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [status, storyHistory, currentIndex]);

  useEffect(() => {
    return () => stopNarration();
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-900 text-amber-100/80 overflow-hidden flex flex-col font-serif">
      <audio ref={bgMusicRef} src="https://upload.wikimedia.org/wikipedia/commons/c/c2/Greensleeves_%28traditional%29.ogg" loop />
      {/* Magical Particles Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Moon */}
        <div className="absolute top-10 right-10 md:top-20 md:right-32 w-24 h-24 md:w-32 md:h-32 rounded-full bg-amber-100/90 shadow-[0_0_60px_20px_rgba(253,230,138,0.3)] flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-transparent to-amber-900/20"></div>
          {/* Moon craters */}
          <div className="absolute top-4 left-6 w-4 h-4 rounded-full bg-amber-900/10 blur-[1px]"></div>
          <div className="absolute top-10 right-8 w-6 h-5 rounded-full bg-amber-900/10 blur-[1px]"></div>
          <div className="absolute bottom-6 left-10 w-8 h-6 rounded-full bg-amber-900/10 blur-[1px]"></div>
        </div>

        {/* Shooting Comets */}
        <motion.div
          className="absolute h-1 w-32 md:w-48 bg-gradient-to-r from-transparent via-white/80 to-white rounded-full blur-[1px]"
          style={{ top: '-10%', right: '-10%', rotate: '135deg' }}
          animate={{
            x: ['0vw', '-120vw'],
            y: ['0vh', '120vh'],
            opacity: [0, 1, 1, 0]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            repeatDelay: 15,
            ease: "linear"
          }}
        />
        <motion.div
          className="absolute h-1 w-24 bg-gradient-to-r from-transparent via-blue-200/80 to-white rounded-full blur-[1px]"
          style={{ top: '30%', right: '-10%', rotate: '135deg' }}
          animate={{
            x: ['0vw', '-100vw'],
            y: ['0vh', '100vh'],
            opacity: [0, 1, 1, 0]
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            repeatDelay: 25,
            delay: 8,
            ease: "linear"
          }}
        />

        {[...Array(40)].map((_, i) => (
          <motion.div
            key={i}
            className={`absolute ${particleColors[i % particleColors.length]} rounded-full`}
            style={{
              width: Math.random() * 3 + 2 + 'px',
              height: Math.random() * 3 + 2 + 'px',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              boxShadow: '0 0 6px 2px rgba(255, 255, 255, 0.4)'
            }}
            animate={{
              opacity: [0.2, Math.random() * 0.6 + 0.4, 0.2],
              scale: [1, Math.random() * 1.5 + 1, 1],
            }}
            transition={{
              duration: Math.random() * 4 + 2,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="h-20 md:h-24 flex-shrink-0 flex items-center justify-between px-4 md:px-8 z-20 relative">
        <div className="w-auto md:w-48 flex justify-start gap-2 md:gap-4">
          {(status === 'idle' || status === 'reading' || status === 'showing_end') && savedStories.length > 0 && (
            <button onClick={() => setShowLibrary(true)} className="text-amber-200 hover:text-amber-100 flex items-center gap-2 font-bold transition-colors">
              <Library className="w-5 h-5 md:w-6 md:h-6" /> 
              <span className="hidden md:inline">Library</span>
            </button>
          )}
          {(status === 'reading' || status === 'showing_end') && (
            <button onClick={handleStartOver} className="text-amber-200 hover:text-amber-100 flex items-center gap-2 font-bold transition-colors">
              <RotateCcw className="w-5 h-5 md:w-6 md:h-6" /> 
              <span className="hidden md:inline">Start Over</span>
            </button>
          )}
          <button 
            onClick={() => {
              setIsNarratorEnabled(!isNarratorEnabled);
              if (isNarratorEnabled && isReading) stopNarration();
            }} 
            className="text-amber-200 hover:text-amber-100 flex items-center gap-2 font-bold transition-colors"
            title={isNarratorEnabled ? "Mute Narrator" : "Enable Narrator"}
          >
            {isNarratorEnabled ? <Volume2 className="w-5 h-5 md:w-6 md:h-6" /> : <VolumeX className="w-5 h-5 md:w-6 md:h-6" />}
          </button>
        </div>
        <h1 className="text-2xl md:text-5xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex items-center gap-2 md:gap-4 text-center">
          <Sparkles className="w-6 h-6 md:w-10 md:h-10 text-amber-400 hidden sm:block animate-pulse" />
          The Whimsical Storyteller
          <Sparkles className="w-6 h-6 md:w-10 md:h-10 text-amber-400 hidden sm:block animate-pulse" />
        </h1>
        <div className="w-24 md:w-48 flex justify-end">
          {(status === 'reading' || status === 'showing_end') && (
            <button onClick={saveStory} className="text-amber-200 hover:text-amber-100 flex items-center gap-2 font-bold transition-colors">
              <Save className="w-5 h-5 md:w-6 md:h-6" /> 
              <span className="hidden md:inline">Save</span>
            </button>
          )}
        </div>
      </header>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 bg-stone-800 text-amber-200 px-6 py-3 rounded-full shadow-xl border-2 border-amber-900/50 font-serif font-bold tracking-wide"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 flex items-center justify-center relative perspective-[2500px]">
        <AnimatePresence mode="wait">
          {(status === 'idle' || status === 'generating_start') && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.5 } }}
              className="w-full max-w-md md:max-w-xl aspect-[3/4] md:aspect-[4/5] h-full max-h-[85vh] bg-[#3e2723] rounded-r-3xl rounded-l-sm shadow-[20px_20px_60px_rgba(0,0,0,0.9)] flex flex-col items-center justify-center border-y-8 border-r-8 border-l-[16px] border-[#2d1b15] p-4 absolute z-10"
            >
              <div className="w-full h-full border-2 border-[#5d4037] rounded-xl p-6 md:p-10 flex flex-col items-center justify-center bg-[#4e342e] relative overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]">
                {/* Corner ornaments */}
                <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-[#8d6e63] rounded-tl-lg opacity-50"></div>
                <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-[#8d6e63] rounded-tr-lg opacity-50"></div>
                <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-[#8d6e63] rounded-bl-lg opacity-50"></div>
                <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-[#8d6e63] rounded-br-lg opacity-50"></div>

                <BookOpen className="w-16 h-16 text-[#d7ccc8] mx-auto mb-6 opacity-80" />
                <h2 className="text-3xl md:text-4xl text-[#ffecb3] font-serif mb-8 text-center font-bold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] leading-tight tracking-wide">
                  What kind of tale shall we weave?
                </h2>
                
                <textarea
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  disabled={status === 'generating_start'}
                  className="w-full max-w-xl bg-[#f4e4bc] border-2 border-[#8d6e63] rounded-sm p-4 text-[#3e2723] placeholder-[#8d6e63] focus:outline-none focus:ring-2 focus:ring-[#5d4037] resize-none h-24 md:h-32 text-xl md:text-2xl mb-8 font-serif shadow-[inset_0_3px_10px_rgba(0,0,0,0.2)] overflow-hidden disabled:opacity-70"
                  placeholder="e.g. a brave little fox who wants to touch the moon..."
                />
                
                <button
                  onClick={handleStart}
                  disabled={status === 'generating_start'}
                  className="w-full max-w-md bg-gradient-to-b from-[#5d4037] to-[#3e2723] hover:from-[#6d4c41] hover:to-[#4e342e] text-[#ffecb3] border-2 border-[#8d6e63] font-bold text-xl md:text-2xl py-4 px-8 rounded-sm shadow-[0_5px_15px_rgba(0,0,0,0.6)] transform transition hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:opacity-80 flex items-center justify-center gap-4 uppercase tracking-widest"
                >
                  {status === 'generating_start' ? (
                    <>
                      <Loader2 className="w-6 h-6 text-[#ffecb3] animate-spin" />
                      Inscribing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-6 h-6 text-[#ffecb3]" />
                      Open the Book
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {status === 'generating_end' && (
            <motion.div 
              key="generating_end"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center justify-center py-20 absolute z-10"
            >
              <div className="relative w-32 h-32 mb-8">
                <div className="absolute inset-0 border-4 border-amber-900/30 rounded-full animate-ping"></div>
                <div className="absolute inset-2 border-4 border-amber-700/50 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
                <div className="absolute inset-4 border-4 border-amber-600 rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }}></div>
                <Sparkles className="absolute inset-0 m-auto w-12 h-12 text-amber-500 animate-pulse" />
              </div>
              <h2 className="text-3xl font-serif text-amber-500 animate-pulse">
                Writing the final words...
              </h2>
              <p className="text-stone-400 mt-4 text-lg italic">Patience, dear reader...</p>
            </motion.div>
          )}

          {status === 'opening_book' && (
            <motion.div
              key="opening_book"
              exit={{ opacity: 0 }}
              className="relative w-full max-w-md md:max-w-xl aspect-[3/4] md:aspect-[4/5] h-full max-h-[85vh] z-50 perspective-[2500px]"
            >
              {/* Back cover (static) */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.9, 1, 1, 1] }}
                transition={{ duration: 2.5, times: [0, 0.1, 0.8, 1], ease: "easeInOut" }}
                className="absolute inset-0 bg-[#3e2723] rounded-r-3xl rounded-l-sm shadow-[20px_20px_60px_rgba(0,0,0,0.9)] border-y-8 border-r-8 border-l-[16px] border-[#2d1b15]" 
              />
              
              {/* Glowing light from inside */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.8, 0] }}
                transition={{ duration: 2.5, times: [0, 0.5, 1], ease: "easeInOut" }}
                className="absolute inset-0 bg-amber-400/40 blur-3xl rounded-r-3xl z-10"
              />

              {/* Flipping pages */}
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={`page-${i}`}
                  initial={{ rotateY: 0, opacity: 0 }}
                  animate={{ 
                    rotateY: [0, 0, -140],
                    opacity: [0, 1, 1, 0]
                  }}
                  transition={{ 
                    duration: 2.5, 
                    times: [0, 0.2 + (i * 0.05), 0.8, 1],
                    ease: "easeInOut"
                  }}
                  style={{ transformOrigin: "left center", zIndex: 20 + i }}
                  className="absolute inset-0 bg-[#fdf6e3] rounded-r-2xl rounded-l-md border border-stone-300 shadow-[inset_0_0_20px_rgba(0,0,0,0.1)]"
                />
              ))}

              {/* Magical particles bursting from book */}
              <motion.div 
                className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 2.5, times: [0, 0.4, 1] }}
              >
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={`burst-${i}`}
                    className="absolute w-3 h-3 bg-yellow-300 rounded-full blur-[1px]"
                    initial={{ x: 0, y: 0, scale: 0 }}
                    animate={{ 
                      x: (Math.random() - 0.5) * 500, 
                      y: (Math.random() - 0.5) * 500,
                      scale: [0, Math.random() * 3 + 1, 0],
                      opacity: [0, 1, 0]
                    }}
                    transition={{ 
                      duration: 1.5 + Math.random(), 
                      delay: 0.5 + Math.random() * 0.5,
                      ease: "easeOut" 
                    }}
                  />
                ))}
              </motion.div>

              {/* Front Cover */}
              <motion.div
                initial={{ rotateY: 0, opacity: 0, scale: 0.9 }}
                animate={{ 
                  rotateY: [0, 0, -160], 
                  opacity: [0, 1, 1, 0], 
                  scale: [0.9, 1, 1, 1] 
                }}
                transition={{ duration: 2.5, times: [0, 0.1, 0.8, 1], ease: "easeInOut" }}
                style={{ transformOrigin: "left center", zIndex: 30 }}
                className="absolute inset-0 bg-[#3e2723] rounded-r-3xl rounded-l-sm shadow-[10px_10px_30px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center border-y-8 border-r-8 border-l-[16px] border-[#2d1b15] p-4"
              >
                <div className="w-full h-full border-2 border-[#5d4037] rounded-xl p-6 flex flex-col items-center justify-center bg-[#4e342e] relative overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]">
                  {/* Corner ornaments */}
                  <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-[#8d6e63] rounded-tl-lg opacity-50"></div>
                  <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-[#8d6e63] rounded-tr-lg opacity-50"></div>
                  <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-[#8d6e63] rounded-bl-lg opacity-50"></div>
                  <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-[#8d6e63] rounded-br-lg opacity-50"></div>

                  <Sparkles className="w-16 h-16 text-[#ffecb3] mb-8 animate-pulse opacity-80" />
                  <h1 className="text-4xl md:text-5xl font-serif text-[#ffecb3] text-center leading-tight drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] font-bold">
                    {storyTitle}
                  </h1>
                  <div className="mt-12 w-32 h-1 bg-[#8d6e63] rounded-full opacity-50"></div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {status === 'reading' && currentIndex >= 0 && (
            <motion.div 
              key="reading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.5 } }}
              className="w-full h-full flex justify-center absolute inset-0 items-center perspective-[2500px]"
            >
              <BookPage
                story={storyHistory[currentIndex].story}
                image={storyHistory[currentIndex].image}
                options={storyHistory[currentIndex].options}
                onOptionSelect={handleNextSegment}
                onReadAloud={handleReadAloud}
                onVoiceInput={handleVoiceInput}
                onEndStory={handleEndStory}
                isReading={isReading}
                isProcessingVoice={isProcessingVoice}
                isGeneratingNext={isGeneratingNext}
                selectedOption={selectedOption}
                currentPage={currentIndex + 1}
                audioProgress={audioProgress}
                onError={showToast}
              />
            </motion.div>
          )}

          {status === 'showing_end' && (
            <motion.div
              key="showing_end"
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: -90, opacity: 0 }}
              transition={{ duration: 0.8, ease: [0.4, 0.0, 0.2, 1] }}
              style={{ transformOrigin: "left center", perspective: 2500 }}
              className="w-full h-full max-h-[85vh] bg-[#e8dcb8] rounded-sm shadow-[inset_0_0_60px_rgba(139,115,85,0.4),_10px_10px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col items-center justify-center border-4 border-stone-800 p-8 md:p-16 text-stone-900 absolute z-40"
            >
              <div className="max-w-3xl text-center flex flex-col items-center">
                <Sparkles className="w-12 h-12 text-stone-700 mb-8" />
                <h2 className="text-3xl md:text-5xl font-serif font-bold mb-12 leading-relaxed text-stone-800">
                  {finalSentence}
                </h2>
                <div className="w-32 h-1 bg-stone-800/30 mb-12 rounded-full"></div>
                <button
                  onClick={() => {
                    stopNarration();
                    setStatus('closing_book');
                  }}
                  className="px-8 py-4 bg-stone-900 text-[#e8dcb8] rounded-sm text-xl font-bold hover:bg-stone-800 transition-colors border-2 border-stone-700 shadow-lg"
                >
                  Close Book
                </button>
              </div>
            </motion.div>
          )}

          {status === 'closing_book' && (
            <motion.div
              key="closing_book"
              initial={{ rotateY: -120, opacity: 0, scale: 1 }}
              animate={{ 
                rotateY: [-120, 0, 0], 
                opacity: [0, 1, 1, 0], 
                scale: [1, 1, 1, 0.9] 
              }}
              transition={{ duration: 2.5, times: [0, 0.2, 0.8, 1], ease: "easeInOut" }}
              style={{ transformOrigin: "left center", perspective: 2500 }}
              className="w-full max-w-md md:max-w-lg aspect-[3/4] h-full max-h-[80vh] bg-stone-900 rounded-r-2xl rounded-l-sm shadow-[20px_20px_60px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center border-8 border-stone-800 p-8 absolute z-50"
            >
              <div className="w-full h-full border-4 border-stone-700/50 rounded-sm p-6 flex flex-col items-center justify-center bg-stone-800/40 relative overflow-hidden">
                <h1 className="text-4xl md:text-6xl font-serif text-amber-200 text-center leading-tight drop-shadow-lg font-bold">
                  The End
                </h1>
                <Sparkles className="w-12 h-12 text-amber-700 mt-8 animate-pulse" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Library Modal */}
      <AnimatePresence>
        {showLibrary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-indigo-900 border-4 border-indigo-800 rounded-lg p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto custom-scrollbar shadow-2xl relative"
            >
              <div className="flex justify-between items-center mb-8 border-b border-indigo-800/50 pb-4">
                <h2 className="text-3xl font-serif text-amber-200 flex items-center gap-3 font-bold">
                  <Library className="w-8 h-8 text-amber-500" />
                  Your Magical Library
                </h2>
                <button onClick={() => setShowLibrary(false)} className="text-indigo-300 hover:text-amber-200 transition-colors">
                  <X className="w-8 h-8" />
                </button>
              </div>
              
              {savedStories.length === 0 ? (
                <div className="text-center py-16">
                  <BookOpen className="w-16 h-16 text-indigo-700 mx-auto mb-4" />
                  <p className="text-indigo-300 text-xl italic font-serif">Your library is empty. Create a story to fill its shelves!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {savedStories.map(story => (
                    <div 
                      key={story.id} 
                      className="bg-indigo-950/60 border-2 border-indigo-800 p-5 rounded-lg hover:border-amber-500/60 transition-all duration-300 group cursor-pointer shadow-lg hover:shadow-amber-900/20 hover:-translate-y-1 flex flex-col" 
                      onClick={() => loadStory(story)}
                    >
                      <h3 className="text-xl font-bold text-amber-100 mb-2 group-hover:text-amber-400 transition-colors font-serif line-clamp-1">{story.title}</h3>
                      <p className="text-indigo-300 text-sm mb-4 line-clamp-2 italic flex-1">"{story.theme}"</p>
                      <div className="flex justify-between items-center text-xs text-indigo-400 font-sans border-t border-indigo-800/50 pt-3 mt-auto">
                        <span>{new Date(story.date).toLocaleDateString()}</span>
                        <div className="flex gap-2">
                          {story.currentIndex !== undefined && story.currentIndex > 0 && (
                            <span className="bg-amber-900/50 text-amber-200 px-2 py-1 rounded-full">Resume pg {story.currentIndex + 1}</span>
                          )}
                          <span className="bg-indigo-900 px-2 py-1 rounded-full">{story.history.length} pages</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
