"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Loader2, Send, Search, MessageSquarePlus, AlertCircle, X, Clock, CheckCircle, Music } from "lucide-react";
import { db, collection, addDoc, getDocs, query, where, doc, updateDoc, onSnapshot, QuerySnapshot } from "@../../../lib/firebase";
import Image from "next/image";

interface MusicSearchProps {
    eventId: string;
    maxSongs?: number;
    qrPaymentUrl?: string;
    acceptPayment: boolean;
}

interface Track {
    id: string;
    title: string;
    artist: {
        name: string;
    };
    album: {
        cover_small: string;
    };
    preview: string;
}

interface Message {
    text: string;
    timestamp: Date;
}

interface SongRequest {
    id: string;
    eventId: string;
    trackId: string;
    title: string;
    artist: string;
    albumCover: string;
    previewUrl: string;
    timestamp: Date;
    count: number;
    messages: Message[];
    paid: boolean;
}

const MusicSearch: React.FC<MusicSearchProps> = ({ eventId, maxSongs = Infinity, qrPaymentUrl, acceptPayment }) => {
    const [queryMusic, setQuery] = useState<string>("");
    const [results, setResults] = useState<Track[]>([]);
    const [playingTrack, setPlayingTrack] = useState<string | null>(null);
    const [loadingTrack, setLoadingTrack] = useState<string | null>(null);
    const [sendingTrack, setSendingTrack] = useState<string | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [songsRequested, setSongsRequested] = useState<number>(0);
    const [showLimitAlert, setShowLimitAlert] = useState<boolean>(false);
    const [messageInputVisible, setMessageInputVisible] = useState<string | null>(null);
    const [messageText, setMessageText] = useState<string>("");
    const [lastRequestTime, setLastRequestTime] = useState<Date | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [showTimeAlert, setShowTimeAlert] = useState<boolean>(false);
    const [showModal, setShowModal] = useState<boolean>(false);
    const [modalContent, setModalContent] = useState<{ title: string; message: string; isUpdate: boolean; showQR: boolean; action?: () => void }>({
        title: "",
        message: "",
        isUpdate: false,
        showQR: false,
    });
    const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Scroll al final cuando cambian los resultados
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [results, messageInputVisible]);

    // Enfocar el input de búsqueda al cargar
    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    // Escuchar solicitudes de canciones en tiempo real
    useEffect(() => {
        const requestRef = collection(db, "event_requests");
        const q = query(requestRef, where("eventId", "==", eventId));

        const unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot) => {
            const requests: SongRequest[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                requests.push({
                    id: doc.id,
                    eventId: data.eventId,
                    trackId: data.trackId,
                    title: data.title,
                    artist: data.artist,
                    albumCover: data.albumCover,
                    previewUrl: data.previewUrl,
                    timestamp: data.timestamp.toDate(),
                    count: data.count || 1,
                    messages: data.messages?.map((msg: any) => ({
                        text: msg.text,
                        timestamp: msg.timestamp.toDate()
                    })) || [],
                    paid: data.paid || false
                });
            });
            setSongsRequested(querySnapshot.size);
        });

        return () => unsubscribe();
    }, [eventId]);

    // Manejar el tiempo de espera entre solicitudes
    useEffect(() => {
        if (lastRequestTime) {
            const calculateTimeLeft = () => {
                const now = new Date();
                const diff = Math.floor((now.getTime() - lastRequestTime.getTime()) / 1000);
                const remaining = 60 - diff;
                setTimeLeft(remaining > 0 ? remaining : 0);

                if (remaining <= 0) {
                    clearInterval(timerRef.current!);
                }
            };

            calculateTimeLeft();
            timerRef.current = setInterval(calculateTimeLeft, 1000);

            return () => clearInterval(timerRef.current!);
        }
    }, [lastRequestTime]);

    const searchMusic = async () => {
        if (!queryMusic) return;
        setIsLoading(true);
        const res = await fetch(`/api/search?query=${queryMusic}`);
        const data = await res.json();
        setResults(data.data);
        setIsLoading(false);
    };

    const togglePlay = (track: Track) => {
        if (playingTrack === track.id) {
            audioRef.current?.pause();
            clearInterval(intervalRef.current!);
            setPlayingTrack(null);
            setProgress(0);
        } else {
            if (audioRef.current) {
                audioRef.current.pause();
                clearInterval(intervalRef.current!);
            }

            setLoadingTrack(track.id);
            audioRef.current = new Audio(track.preview);

            audioRef.current.oncanplay = () => {
                setLoadingTrack(null);
                audioRef.current?.play();
                setPlayingTrack(track.id);
                setProgress(0);

                intervalRef.current = setInterval(() => {
                    if (audioRef.current) {
                        const percentage = (audioRef.current.currentTime / audioRef.current.duration) * 100;
                        setProgress(percentage);
                    }
                }, 500);
            };

            audioRef.current.onended = () => {
                clearInterval(intervalRef.current!);
                setPlayingTrack(null);
                setProgress(0);
            };

            audioRef.current.onerror = () => {
                setLoadingTrack(null);
                setPlayingTrack(null);
                alert("Error al reproducir la canción.");
            };

            audioRef.current.load();
        }
    };

    const toggleMessageInput = (trackId: string) => {
        if (messageInputVisible === trackId) {
            setMessageInputVisible(null);
            setMessageText("");
        } else {
            setMessageInputVisible(trackId);
            setMessageText("");
        }
    };

    const sendToDJ = async (track: Track) => {
        if (lastRequestTime && timeLeft > 0) {
            setShowTimeAlert(true);
            setTimeout(() => setShowTimeAlert(false), 3000);
            return;
        }

        if (songsRequested >= maxSongs) {
            setShowLimitAlert(true);
            setTimeout(() => setShowLimitAlert(false), 3000);
            return;
        }

        setSelectedTrack(track);

        if (acceptPayment && qrPaymentUrl) {
            setModalContent({
                title: "Apoya al DJ",
                message: "¿Te gustaría hacer una contribución al DJ?",
                isUpdate: false,
                showQR: true,
                action: () => processTrackSubmission(track, false),
            });
            setShowModal(true);
            return;
        }

        await processTrackSubmission(track, false);
    };

    const processTrackSubmission = async (track: Track, withPayment: boolean) => {
        setSendingTrack(track.id);
        try {
            const requestRef = collection(db, "event_requests");
            const q = query(requestRef, where("eventId", "==", eventId), where("trackId", "==", track.id));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const existingDoc = querySnapshot.docs[0];
                const existingData = existingDoc.data();
                const docRef = doc(db, "event_requests", existingDoc.id);

                const newMessage = messageText ? {
                    text: messageText,
                    timestamp: new Date()
                } : null;

                const updatedMessages = [
                    ...(existingData.messages || []),
                    ...(newMessage ? [newMessage] : [])
                ];

                await updateDoc(docRef, {
                    count: existingData.count + 1,
                    ...(newMessage && { messages: updatedMessages }),
                    ...(withPayment && { paid: true }),
                });

                setModalContent({
                    title: "Canción Actualizada",
                    message: `"${track.title}" de ${track.artist.name} ya fue solicitada. Se aumentó el contador.`,
                    isUpdate: true,
                    showQR: false,
                });
            } else {
                const newMessage = messageText ? {
                    text: messageText,
                    timestamp: new Date()
                } : null;

                await addDoc(requestRef, {
                    eventId: eventId,
                    trackId: track.id,
                    title: track.title,
                    artist: track.artist.name,
                    albumCover: track.album.cover_small,
                    previewUrl: track.preview,
                    timestamp: new Date(),
                    count: 1,
                    messages: newMessage ? [newMessage] : [],
                    paid: withPayment || false,
                });

                setModalContent({
                    title: "¡Canción Enviada!",
                    message: `"${track.title}" de ${track.artist.name} ha sido enviada al DJ 🎶`,
                    isUpdate: false,
                    showQR: false,
                });
            }

            setShowModal(true);
            setLastRequestTime(new Date());
        } catch (error) {
            console.error("Error al enviar la canción: ", error);
            setModalContent({
                title: "Error",
                message: "Hubo un error al enviar tu canción.",
                isUpdate: false,
                showQR: false,
            });
            setShowModal(true);
        }
        setSendingTrack(null);
        setMessageInputVisible(null);
        setMessageText("");
    };

    const handlePaymentConfirmation = (proceedWithPayment: boolean) => {
        if (proceedWithPayment) {
            processTrackSubmission(selectedTrack!, true);
        } else {
            processTrackSubmission(selectedTrack!, false);
        }
    };

    const closeModal = () => {
        setShowModal(false);
    };

    return (
        <div className="flex flex-col h-full bg-gradient-to-b text-white rounded-xl overflow-hidden">
            {/* Encabezado */}
            <div className="p-4 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Solicitud de Música</h1>
                        {/* <p className="text-gray-400 text-sm">
                            {maxSongs !== Infinity ? (
                                `${songsRequested}/${maxSongs} canciones solicitadas`
                            ) : (
                                "Pide tus canciones favoritas"
                            )}
                        </p> */}
                    </div>
                    <div className="bg-purple-600 p-2 rounded-full">
                        <Music className="h-6 w-6" />
                    </div>
                </div>
            </div>

            {/* Barra de búsqueda */}
            <div className="py-4 px-2 bg-gray-800">
                <div className="relative">
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Buscar canciones o artistas..."
                        value={queryMusic}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchMusic()}
                        className="w-full bg-gray-700 rounded-full py-3 px-5 pr-12 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                        onClick={searchMusic}
                        disabled={!queryMusic || isLoading}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-purple-600 p-2 rounded-full disabled:opacity-50"
                    >
                        {isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Search className="h-5 w-5" />
                        )}
                    </button>
                </div>
            </div>

            {/* Alertas */}
            <AnimatePresence>
                {showLimitAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-red-600 px-2 text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-2"
                    >
                        <AlertCircle className="h-4 w-4" />
                        <span>Límite alcanzado ({maxSongs} canciones)</span>
                    </motion.div>
                )}

                {showTimeAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-yellow-600 px-2 text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-2 my-2"
                    >
                        <Clock className="h-4 w-4" />
                        <span>Espera {timeLeft} segundos antes de otra solicitud</span>
                    </motion.div>
                )}

                {timeLeft > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gray-700 text-white text-center py-2 mx-2 mb-4 rounded-lg text-sm flex items-center justify-center gap-2 my-2"
                    >
                        <Clock className="h-4 w-4" />
                        <span>Tiempo de espera: {timeLeft}s restantes</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Contenedor de resultados */}
            <div className="flex-1 px-2 overflow-y-auto bg-gray-800">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-4" />
                        <p className="text-gray-400">Buscando canciones...</p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                        <Music className="h-16 w-16 text-gray-600 mb-4" />
                        <h3 className="text-xl font-medium text-gray-400">Encuentra tus canciones favoritas</h3>
                        <p className="text-gray-500 mt-2">Busca artistas o canciones para hacer tu pedido</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {results.map((track) => (
                            <div key={track.id} className="bg-gray-700 rounded-lg overflow-hidden shadow">
                                {/* Información de la canción */}
                                <div className="p-4 flex items-center gap-4">
                                    <div className="relative">
                                        <Image
                                            src={track.album.cover_small.replace("56x56", "250x250")}
                                            alt={track.title}
                                            width={250}
                                            height={250}
                                            className="w-14 h-14 rounded-lg object-cover"
                                        />
                                        <button
                                            onClick={() => togglePlay(track)}
                                            disabled={loadingTrack === track.id}
                                            className={`absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg transition-opacity ${playingTrack === track.id ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
                                        >
                                            {loadingTrack === track.id ? (
                                                <Loader2 className="h-6 w-6 animate-spin text-white" />
                                            ) : playingTrack === track.id ? (
                                                <Pause className="h-6 w-6 text-white" />
                                            ) : (
                                                <Play className="h-6 w-6 text-white" />
                                            )}
                                        </button>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium truncate">{track.title}</h3>
                                        <p className="text-sm text-gray-400 truncate">{track.artist.name}</p>

                                        {/* Barra de progreso */}
                                        {playingTrack === track.id && (
                                            <div className="mt-2 bg-gray-600 rounded-full h-1 overflow-hidden">
                                                <div
                                                    className="h-full bg-purple-500"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => toggleMessageInput(track.id)}
                                            className="p-2 text-gray-400 hover:text-white transition-colors"
                                        >
                                            <MessageSquarePlus className="h-5 w-5" />
                                        </button>

                                        <button
                                            onClick={() => sendToDJ(track)}
                                            disabled={
                                                sendingTrack === track.id ||
                                                songsRequested >= maxSongs ||
                                                (lastRequestTime !== null && timeLeft > 0)
                                            }
                                            className={`p-2 rounded-full ${songsRequested >= maxSongs || (lastRequestTime && timeLeft > 0)
                                                ? "bg-gray-600 text-gray-500 cursor-not-allowed"
                                                : "bg-purple-600 text-white hover:bg-purple-700"
                                                } transition-colors`}
                                        >
                                            {sendingTrack === track.id ? (
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                            ) : (
                                                <Send className="h-5 w-5" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Input de mensaje */}
                                {messageInputVisible === track.id && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="px-4 pb-4"
                                    >
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Añade un mensaje para el DJ..."
                                                value={messageText}
                                                onChange={(e) => setMessageText(e.target.value)}
                                                className="w-full bg-gray-800 text-white p-3 pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                                            />
                                            <button
                                                onClick={() => toggleMessageInput(track.id)}
                                                className="absolute right-3 top-3 text-gray-400 hover:text-white"
                                            >
                                                <X className="h-5 w-5" />
                                            </button>
                                        </div>

                                        {/* Historial de mensajes */}
                                        {/* {getExistingMessages(track.id).length > 0 && (
                                            <div className="mt-3">
                                                <h4 className="text-xs text-gray-400 mb-1">Mensajes anteriores:</h4>
                                                <div className="space-y-2">
                                                    {getExistingMessages(track.id).map((msg, index) => (
                                                        <div key={index} className="bg-gray-800 p-2 rounded-lg">
                                                            <div className="flex justify-between items-start">
                                                                <p className="text-sm">{msg.text}</p>
                                                                <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                                                                    {formatTime(msg.timestamp)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )} */}
                                    </motion.div>
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Modal de confirmación */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-xl border border-gray-700"
                        >
                            <div className="text-center">
                                <div className="bg-purple-600/20 p-3 rounded-full w-max mx-auto mb-4">
                                    <CheckCircle className="h-8 w-8 text-purple-400" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">{modalContent.title}</h3>
                                <p className="mb-6 text-gray-400">{modalContent.message}</p>

                                {modalContent.showQR && (
                                    <>
                                        <Image
                                            src={qrPaymentUrl!}
                                            alt="Código QR para contribución"
                                            className="mx-auto w-48 h-48 border border-gray-700 rounded-lg mb-6"
                                            width={192}
                                            height={192}
                                        />
                                        <div className="flex justify-center gap-3">
                                            <button
                                                onClick={() => {
                                                    handlePaymentConfirmation(false);
                                                    closeModal();
                                                }}
                                                className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-colors flex-1"
                                            >
                                                Saltar
                                            </button>
                                            <button
                                                onClick={() => {
                                                    handlePaymentConfirmation(true);
                                                    closeModal();
                                                }}
                                                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors flex-1"
                                            >
                                                Contribuir
                                            </button>
                                        </div>
                                    </>
                                )}

                                {!modalContent.showQR && (
                                    <button
                                        onClick={closeModal}
                                        className="w-full px-6 py-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                                    >
                                        ¡Entendido!
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MusicSearch;