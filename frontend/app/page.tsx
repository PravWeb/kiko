"use client";

import { useCallback, useState } from "react";
import Background from "@/components/Background";
import ControlPanel from "@/components/ControlPanel";
import Header from "@/components/Header";
import Toast from "@/components/Toast";
import { useChat } from "@/hooks/useChat";
import { useMic } from "@/hooks/useMic";
import { useVoiceLive } from "@/hooks/useVoiceLive";
import { useDocs } from "@/hooks/useDocs";
import { useReadAloud } from "@/hooks/useReadAloud";
import { useSession } from "@/hooks/useSession";
import { useSpeechPlayer } from "@/hooks/useSpeechPlayer";
import { useStatus } from "@/hooks/useStatus";
import { useTimers } from "@/hooks/useTimers";
import { useTutor } from "@/hooks/useTutor";
import { useVoiceStudio } from "@/hooks/useVoiceStudio";
import { useMemory } from "@/hooks/useMemory";
import { speakRequest } from "@/lib/api";
import { cleanForSpeech } from "@/lib/speechClean";
import type { Mode } from "@/components/ControlPanel";
import type { Emotion } from "@/lib/charState";

export default function Home() {
  const toast = useCallback((t: string) => {
    setError(t);
    setTimeout(() => setError((cur) => (cur === t ? null : cur)), 4200);
  }, []);
  const [error, setError] = useState<string | null>(null);

  const { status, languages, voices, llmReady, llmLoading } = useStatus();
  const session = useSession();
  const player = useSpeechPlayer();
  const mic = useMic();
  const memory = useMemory(toast);

  const [charEmotion, setCharEmotion] = useState<Emotion>("neutral");
  void charEmotion;
  void setCharEmotion;
  const [chatLang, setChatLang] = useState<"en" | "hi">("en");
  const [audioLoadingId, setAudioLoadingId] = useState<number | null>(null);

  const voiceStudio = useVoiceStudio({
    msgs: session.msgs,
    setMsgs: session.setMsgs,
    playBlob: player.playBlob,
    toast,
  });

  const chat = useChat({
    msgs: session.msgs,
    setMsgs: session.setMsgs,
    playBlob: player.playBlob,
    startMic: mic.start,
    toast,
    voice: voiceStudio.voice,
    lang: chatLang,
  });

  const voiceLive = useVoiceLive({
    msgs: session.msgs,
    setMsgs: session.setMsgs,
    setCharState: player.setCharState,
    toast,
    voice: voiceStudio.voice,
    lang: chatLang,
    toolsOn: chat.toolsOn,
  });

  const docs = useDocs({
    msgs: session.msgs,
    setMsgs: session.setMsgs,
    playBlob: player.playBlob,
    toast,
    voice: voiceStudio.voice,
    speed: voiceStudio.speed,
  });

  const onSpeakMsg = useCallback(
    async (id: number, text: string) => {
      try {
        setAudioLoadingId(id);
        const spoken = cleanForSpeech(text);
        const { blob, duration } = await speakRequest({
          text: spoken,
          voice: voiceStudio.voice,
          speed: voiceStudio.speed,
        });
        const url = URL.createObjectURL(blob);
        session.setMsgs((m) =>
          m.map((x) => (x.id === id ? { ...x, url, dur: duration, audioLoading: false } : x))
        );
        await player.playBlob(blob, url, duration);
      } catch (e) {
        toast("Audio generation failed");
      } finally {
        setAudioLoadingId(null);
      }
    },
    [voiceStudio.voice, voiceStudio.speed, player, session.setMsgs, toast]
  );

  const readAloud = useReadAloud({ playBlob: player.playBlob, toast });
  const tutor = useTutor({ playBlob: player.playBlob });

  const timers = useTimers({
    onFire: (t) => {
      player.setCharState("happy");
      toast(`⏱ ${t.label} done!`);
      setTimeout(() => player.setCharState("idle"), 1800);
    },
  });

  const [mode, setMode] = useState<Mode>("chat");
  const [voiceTab, setVoiceTab] = useState<"write" | "speak">("write");
  const [docQuery, setDocQuery] = useState("");

  const bothReady = status?.tts.ready && status?.stt.ready;

  // sync voiceStudio text into readAloud/tutor/translate via shared? They own their own text.
  // Read aloud uses its own text; seed from voiceStudio text on mode switch handled in panel.

  const handleTimersExport = () => {};

  return (
    <>
      <Background />
      <div className="shell">
        <Header status={status} />
        <main className="main">
          <ControlPanel
            mode={mode}
            setMode={setMode}
            text={
              mode === "chat"
                ? chat.text
                : mode === "read"
                  ? readAloud.text
                  : mode === "tutor"
                    ? tutor.target
                    : mode === "docs"
                      ? docQuery
                      : voiceStudio.text
            }
            setText={
              mode === "chat"
                ? chat.setText
                : mode === "read"
                  ? readAloud.setText
                  : mode === "tutor"
                    ? tutor.setTarget
                    : mode === "docs"
                      ? setDocQuery
                      : voiceStudio.setText
            }
            busy={player.busy}
            speaking={player.charState === "talking"}
            liveState={voiceLive.active ? player.charState : null}
            recording={
              mode === "voice"
                ? voiceStudio.recording
                : mode === "tutor"
                  ? tutor.recording
                  : mode === "docs"
                    ? mic.recording
                    : (mic.recording || voiceLive.active)
            }
            level={
              mode === "voice"
                ? voiceStudio.level
                : mode === "tutor"
                  ? tutor.level
                  : mode === "docs"
                    ? mic.level
                    : (voiceLive.active ? voiceLive.level : mic.level)
            }
            transcript={
              voiceLive.active
                ? voiceLive.interim
                : (mode === "voice" ? voiceStudio.transcript : mic.transcript || tutor.transcript)
            }
            voices={voices}
            langFilter={voiceStudio.langFilter}
            setLangFilter={voiceStudio.setLangFilter}
            voice={voiceStudio.voice}
            setVoice={voiceStudio.setVoice}
            speed={voiceStudio.speed}
            setSpeed={voiceStudio.setSpeed}
            effect={voiceStudio.effect}
            setEffect={(e: string) => voiceStudio.setEffect(e as never)}
            onGenerate={() => voiceStudio.generate()}
            onMicToggle={() => {
              if (mode === "chat") {
                voiceLive.toggle();
              } else if (mode === "docs") {
                if (mic.recording) {
                  mic.stop().then((blob) => {
                    if (blob) void docs.askWithVoice(blob);
                  });
                } else {
                  void mic.start();
                }
              } else if (mode === "voice") {
                voiceStudio.onMicToggle();
              }
            }}
            msgs={session.msgs}
            onReplay={(url: string) => player.play(url)}
            voiceTab={voiceTab}
            setVoiceTab={setVoiceTab}
            chatBusy={chat.chatBusy}
            onSendChat={(t?: string) => chat.sendChat(t)}
            loopOn={chat.loopOn}
            setLoopOn={chat.setLoopOn}
            toolsOn={chat.toolsOn}
            setToolsOn={chat.setToolsOn}
            webSearchOn={mode === "docs" ? docs.webSearchOn : chat.webSearchOn}
            setWebSearchOn={mode === "docs" ? docs.setWebSearchOn : chat.setWebSearchOn}
            brain={mode === "docs" ? docs.brain : chat.brain}
            setBrain={mode === "docs" ? docs.setBrain : chat.setBrain}
            chatLang={chatLang}
            setChatLang={setChatLang}
            llmReady={llmReady}
            llmLoading={llmLoading}
            timers={timers.timers}
            onSummarize={() => readAloud.summarize()}
            summarizing={readAloud.summarizing}
            onReadAloud={() =>
              readAloud.readAloud(voiceStudio.voice, voiceStudio.speed)
            }
            reading={readAloud.reading}
            readProgress={readAloud.readProgress}
            tutorTarget={tutor.target}
            setTutorTarget={tutor.setTarget}
            onTutorRecord={() => tutor.recordAndScore()}
            tutorChecking={tutor.checking}
            tutorResult={tutor.result}
            onTutorSpeak={() => tutor.speakTarget()}
            onExportMd={() => session.exportMarkdown()}
            onExportZip={() => session.exportZip()}
            exporting={session.exporting}
            onClearSession={session.clearSession}
            onReadUpload={readAloud.uploadFile}
            onVoiceUpload={voiceStudio.uploadScript}
            memory={memory.memory}
            onAddMemory={memory.add}
            onDeleteMemory={memory.del}
            onClearMemory={memory.clear}
            timings={player.timings}
            activeWord={player.activeWord}
            docList={docs.docList}
            activeDocId={docs.activeDocId}
            docsBusy={docs.busy}
            onDocUpload={(f: File) => docs.upload(f)}
            onDocAsk={(q?: string) => {
              void docs.ask(q ?? docQuery);
              setDocQuery("");
            }}
            onDocSummarize={() => docs.summarize()}
            onDocSelect={docs.select}
            onDocDelete={docs.del}
            onSpeakMsg={onSpeakMsg}
            audioLoadingId={audioLoadingId}
          />
        </main>
        {!bothReady && (
          <div className="prep-note">
            warming up the voice engines — <b>first launch takes ~10 seconds</b>,
            afterwards everything runs fully offline.
          </div>
        )}
      </div>
      {error && <Toast message={error} onDismiss={() => setError(null)} />}
    </>
  );
}
