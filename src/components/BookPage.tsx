import { motion } from "motion/react";
import { Mic, Volume2, Sparkles, Loader2, Square } from "lucide-react";
import { useState, useRef } from "react";

interface BookPageProps {
  story: string;
  image: string;
  options: string[];
  onOptionSelect: (option: string) => void;
  onReadAloud: () => void;
  onVoiceInput: (audioBlob: Blob) => void;
  onEndStory: () => void;
  isReading: boolean;
  isProcessingVoice: boolean;
  isGeneratingNext?: boolean;
  selectedOption?: string | null;
  currentPage: number;
  audioProgress?: number;
  onError: (msg: string) => void;
}

export function BookPage({
  story,
  image,
  options,
  onOptionSelect,
  onReadAloud,
  onVoiceInput,
  onEndStory,
  isReading,
  isProcessingVoice,
  isGeneratingNext,
  selectedOption,
  currentPage,
  audioProgress = 0,
  onError
}: BookPageProps) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isStartingRef = useRef(false);
  const shouldStopRef = useRef(false);

  const startRecording = async () => {
    if (isStartingRef.current || isRecording) return;
    isStartingRef.current = true;
    shouldStopRef.current = false;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // If user released the button while we were getting permissions
      if (shouldStopRef.current) {
        stream.getTracks().forEach(track => track.stop());
        isStartingRef.current = false;
        return;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        onVoiceInput(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      isStartingRef.current = false;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      onError("Could not access microphone. Please ensure permissions are granted.");
      isStartingRef.current = false;
    }
  };

  const stopRecording = () => {
    shouldStopRef.current = true;
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const words = story.split(' ');
  
  const getOptionsText = () => {
    if (!options || options.length === 0) return "";
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
    return optionsText;
  };

  const optionsText = getOptionsText();
  const totalChars = story.length + (optionsText ? optionsText.length + 1 : 0);
  const storyRatio = totalChars > 0 ? story.length / totalChars : 1;
  
  let currentWordIndex = -1;
  let currentOptionIndex = -1;

  if (isReading) {
    if (audioProgress <= storyRatio) {
      const storyProgress = storyRatio > 0 ? audioProgress / storyRatio : 0;
      currentWordIndex = Math.floor(storyProgress * words.length);
    } else {
      const optionsProgress = (audioProgress - storyRatio) / (1 - storyRatio);
      currentOptionIndex = Math.floor(optionsProgress * options.length);
    }
  }

  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0, scale: 0.95 }}
      animate={{ rotateY: 0, opacity: 1, scale: 1 }}
      exit={{ rotateY: -90, opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.8, ease: [0.4, 0.0, 0.2, 1] }}
      style={{ transformOrigin: "left center", perspective: 2000 }}
      className="w-full max-w-5xl h-[85vh] mx-auto bg-[#e8dcb8] rounded-sm shadow-[inset_0_0_60px_rgba(139,115,85,0.4),_10px_10px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col md:flex-row border-4 border-stone-800"
    >
      {/* Left Page: Image */}
      <div className="w-full md:w-1/2 p-6 md:p-10 border-b md:border-b-0 md:border-r-2 border-stone-700/50 border-dashed flex flex-col justify-center items-center bg-[#d4c4a1]/30 group relative shrink-0">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] opacity-20 pointer-events-none mix-blend-multiply"></div>
        <div className="relative w-full aspect-square rounded-sm overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] border-8 border-stone-800 transition-all duration-700 ease-out group-hover:scale-[1.05] group-hover:shadow-[0_0_40px_rgba(99,102,241,0.6)] group-hover:rotate-1 z-10">
          {image ? (
            <>
              <img src={image} alt="Story illustration" className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110 sepia-[0.2]" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-indigo-900/20 mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-stone-800 text-amber-600">
              <Sparkles className="w-12 h-12 animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {/* Right Page: Text & Options */}
      <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col bg-[#e8dcb8] relative overflow-y-auto custom-scrollbar">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] opacity-20 pointer-events-none mix-blend-multiply"></div>
        <div className="relative z-10 flex-1 flex flex-col">
          <div className="flex flex-col items-center mb-6 shrink-0">
            <span className="text-xs font-bold text-stone-600 uppercase tracking-widest mb-2 font-serif">Chapter {currentPage}</span>
            <div className="flex justify-center items-center space-x-1.5">
              {[...Array(Math.max(5, currentPage))].map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i < currentPage 
                      ? 'bg-amber-700 w-6 shadow-sm shadow-amber-900/50' 
                      : 'bg-stone-400/50 w-3'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-between items-start mb-6 shrink-0">
            <h2 className="font-serif text-2xl md:text-4xl text-stone-900 leading-relaxed drop-shadow-sm select-text cursor-text font-medium">
              {words.map((word, i) => (
                <span 
                  key={i} 
                  className={`transition-colors duration-200 ${isReading && i === currentWordIndex ? 'bg-amber-300/60 text-amber-950 rounded-md px-1' : ''}`}
                >
                  {word}{' '}
                </span>
              ))}
            </h2>
            <button
              onClick={onReadAloud}
              disabled={isReading}
              className="p-4 md:p-5 rounded-full bg-stone-800 text-amber-400 hover:bg-stone-700 transition-colors disabled:opacity-50 flex-shrink-0 ml-6 border-4 border-stone-600 shadow-xl transform hover:scale-105 active:scale-95"
              title="Read aloud"
            >
              {isReading ? <Volume2 className="w-8 h-8 md:w-10 md:h-10 animate-pulse" /> : <Volume2 className="w-8 h-8 md:w-10 md:h-10" />}
            </button>
          </div>

          <div className="mt-auto pt-8 space-y-4 relative z-10 shrink-0">
            <p className="text-base font-bold text-stone-600 uppercase tracking-wider mb-4 font-serif text-center border-b border-stone-400/30 pb-2">What happens next?</p>
          {options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => onOptionSelect(option)}
              disabled={isGeneratingNext}
              className={`w-full text-left p-5 md:p-6 rounded-2xl border-4 transition-all font-serif font-bold text-xl md:text-2xl flex items-center group shadow-md select-text transform hover:scale-[1.02] active:scale-[0.98] ${
                isGeneratingNext && selectedOption === option 
                  ? 'border-amber-700 bg-amber-900/10 text-amber-900' 
                  : isGeneratingNext 
                    ? 'border-stone-300 bg-stone-200/50 text-stone-500 opacity-50 cursor-not-allowed'
                    : isReading && currentOptionIndex === idx
                      ? 'border-amber-500 bg-amber-100 text-amber-900 scale-[1.04] shadow-xl'
                      : 'border-stone-500 hover:border-violet-800 hover:bg-violet-800 hover:text-amber-100 text-stone-800 bg-white/50'
              }`}
            >
              <span className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center mr-4 md:mr-6 transition-colors border-2 shrink-0 text-xl ${
                isGeneratingNext && selectedOption === option
                  ? 'bg-amber-700 text-amber-100 border-amber-800'
                  : isReading && currentOptionIndex === idx
                    ? 'bg-amber-500 text-amber-950 border-amber-600'
                    : 'bg-stone-200 text-stone-700 border-stone-400 group-hover:bg-violet-700 group-hover:text-amber-200 group-hover:border-violet-600'
              }`}>
                {isGeneratingNext && selectedOption === option ? <Loader2 className="w-6 h-6 animate-spin" /> : idx + 1}
              </span>
              <span>{option}</span>
            </button>
          ))}

          <div className="pt-6 mt-6 border-t border-stone-400/30 flex flex-col items-center">
            <p className="text-sm text-stone-600 mb-3 uppercase tracking-widest font-serif font-bold">Or speak thy mind</p>
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={isProcessingVoice || isGeneratingNext}
              className={`p-6 rounded-full transition-all shadow-xl flex items-center justify-center border-4 ${
                isRecording 
                  ? 'bg-amber-600 text-amber-100 scale-110 animate-pulse shadow-[0_0_30px_rgba(217,119,6,0.6)] border-amber-800' 
                  : 'bg-violet-800 text-amber-300 border-violet-950 hover:bg-violet-700 hover:scale-105'
              } ${(isProcessingVoice || isGeneratingNext) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isProcessingVoice ? (
                <Loader2 className="w-10 h-10 md:w-12 md:h-12 animate-spin" />
              ) : isRecording ? (
                <Square className="w-10 h-10 md:w-12 md:h-12 fill-current" />
              ) : (
                <Mic className="w-10 h-10 md:w-12 md:h-12" />
              )}
            </button>
            <p className="text-sm text-stone-600 mt-3 font-serif italic font-medium">
              {isRecording ? "Listening... release to speak" : "Hold to speak"}
            </p>
          </div>

          <div className="pt-4 mt-4 flex justify-center">
            <button
              onClick={onEndStory}
              disabled={isGeneratingNext}
              className="text-sm text-stone-500 hover:text-stone-800 transition-colors underline decoration-dotted underline-offset-4 font-serif font-bold"
            >
              Close the Tome (End Story)
            </button>
          </div>
        </div>
      </div>
    </div>
    </motion.div>
  );
}
