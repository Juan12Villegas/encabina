"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Loader2, Send, Search, MessageSquarePlus, AlertCircle, X, Clock, CheckCircle } from "lucide-react";
import { db, collection, addDoc, getDocs, query, where, doc, updateDoc, onSnapshot, QuerySnapshot } from "@../../../lib/firebase";
import Image from "next/image";

// Definir los tipos para las props del componente
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

    // Escuchar cambios en tiempo real de las canciones solicitadas
    useEffect(() => {
        const requestRef = collection(db, "event_requests");
        const q = query(requestRef, where("eventId", "==", eventId));

        const unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot) => {
            setSongsRequested(querySnapshot.size);
        });

        return () => unsubscribe();
    }, [eventId]);

    // Manejar el temporizador de espera entre solicitudes
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
        // Verificar si hay que esperar antes de hacer otra solicitud
        if (lastRequestTime && timeLeft > 0) {
            setShowTimeAlert(true);
            setTimeout(() => setShowTimeAlert(false), 3000);
            return;
        }

        // Verificar si se ha alcanzado el límite de canciones
        if (songsRequested >= maxSongs) {
            setShowLimitAlert(true);
            setTimeout(() => setShowLimitAlert(false), 3000);
            return;
        }

        setSelectedTrack(track);

        // Verificar si se deben mostrar el QR de pago
        if (acceptPayment && qrPaymentUrl) {
            setModalContent({
                title: "Colabora con el DJ",
                message: "¿Te gustaría apoyar al DJ?",
                isUpdate: false,
                showQR: true,
                action: () => processTrackSubmission(track, false), // false = no payment
            });
            setShowModal(true);
            return;
        }

        // Si no hay pago requerido, proceder directamente con el envío
        await processTrackSubmission(track, false);
    };

    const processTrackSubmission = async (track: Track, withPayment: boolean) => {
        setSendingTrack(track.id);
        try {
            // Verificar si la canción ya está en la base de datos
            const requestRef = collection(db, "event_requests");
            const q = query(requestRef, where("eventId", "==", eventId), where("trackId", "==", track.id));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                // Si la canción ya fue solicitada, incrementamos el contador
                const existingDoc = querySnapshot.docs[0];
                const existingData = existingDoc.data();
                const docRef = doc(db, "event_requests", existingDoc.id);

                await updateDoc(docRef, {
                    count: existingData.count + 1,
                    ...(messageText && { message: messageText }),
                    ...(withPayment && { paid: true }),
                });

                setModalContent({
                    title: "Canción actualizada",
                    message: `"${track.title}" de ${track.artist.name} ya fue solicitada. Contador actualizado.`,
                    isUpdate: true,
                    showQR: false,
                });
            } else {
                // Si la canción no está en la base de datos, la registramos con un contador inicial de 1
                await addDoc(requestRef, {
                    eventId: eventId,
                    trackId: track.id,
                    title: track.title,
                    artist: track.artist.name,
                    albumCover: track.album.cover_small,
                    previewUrl: track.preview,
                    timestamp: new Date(),
                    count: 1,
                    message: messageText || null,
                    paid: withPayment || false,
                });

                setModalContent({
                    title: "Canción enviada",
                    message: `"${track.title}" de ${track.artist.name} ha sido enviada al DJ 🎶`,
                    isUpdate: false,
                    showQR: false,
                });
            }

            // Mostrar el modal de confirmación
            setShowModal(true);

            // Establecer el tiempo de la última solicitud
            setLastRequestTime(new Date());
        } catch (error) {
            console.error("Error al enviar la canción: ", error);
            setModalContent({
                title: "Error",
                message: "Hubo un error al enviar la canción.",
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
        <div className={`w-full`}>
            {/* Temporizador visual fijo en la parte superior */}
            {timeLeft > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`fixed text-center top-4 left-1/2 transform -translate-x-1/2 z-40 px-4 py-2 rounded-full flex items-center gap-2 shadow-lg`}
                >
                    <Clock className="h-5 w-5" />
                    <span className="font-medium">Espera {timeLeft}s para otra solicitud</span>
                </motion.div>
            )}

            {/* Encabezado */}
            <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <h2 className="text-xl font-bold">Pon tu canción EN CABINA</h2>
                </div>
                <p className={`text-sm`}>
                    Busca y envía tus canciones favoritas al DJ
                </p>

                {/* Mostrar contador de canciones si hay límite */}
                {maxSongs !== Infinity && (
                    <p className={`text-sm mt-2`}>
                        Canciones solicitadas: {songsRequested}/{maxSongs}
                    </p>
                )}
            </div>

            {/* Alerta de límite alcanzado */}
            {showLimitAlert && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`mb-4 p-3 rounded-lg flex items-center gap-2`}
                >
                    <AlertCircle className="h-5 w-5" />
                    <span>Límite de canciones alcanzado ({maxSongs} canciones)</span>
                </motion.div>
            )}

            {/* Alerta de tiempo de espera */}
            {showTimeAlert && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`mb-4 p-3 rounded-lg flex items-center gap-2`}
                >
                    <Clock className="h-5 w-5" />
                    <span>Espera {timeLeft} segundos antes de solicitar otra canción</span>
                </motion.div>
            )}

            {/* Modal de confirmación */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`rounded-xl p-6 max-w-md w-full`}
                    >
                        <div className="text-center">
                            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                            <h3 className="text-xl font-bold mb-2">{modalContent.title}</h3>
                            <p className="mb-4">{modalContent.message}</p>

                            {/* Mostrar QR si es necesario */}
                            {modalContent.showQR && (
                                <>
                                    <Image
                                        src={qrPaymentUrl!}
                                        alt="Código QR para colaboración"
                                        className="mx-auto w-48 h-48 border border-gray-300 rounded-lg mb-4"
                                        width={192}
                                        height={192}
                                    />
                                    <div className="flex justify-center gap-4">
                                        <button
                                            onClick={() => {
                                                handlePaymentConfirmation(false);
                                                closeModal();
                                            }}
                                            className={`px-4 py-2 rounded-lg transition-colors`}
                                        >
                                            No, gracias
                                        </button>
                                        <button
                                            onClick={() => {
                                                handlePaymentConfirmation(true);
                                                closeModal();
                                            }}
                                            className={`px-4 py-2 rounded-lg text-white transition-colors`}
                                        >
                                            Sí, colaborar
                                        </button>
                                    </div>
                                </>
                            )}

                            {!modalContent.showQR && (
                                <button
                                    onClick={closeModal}
                                    className={`mt-4 px-6 py-2 rounded-lg text-white transition-colors`}
                                >
                                    Aceptar
                                </button>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Barra de búsqueda */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex items-center rounded-xl overflow-hidden shadow-sm mb-6`}
            >
                <input
                    type="text"
                    placeholder="Buscar canción o artista..."
                    value={queryMusic}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchMusic()}
                    className={`px-4 py-3 w-full focus:outline-none`}
                />
                <button
                    onClick={searchMusic}
                    disabled={!queryMusic || isLoading}
                    className={`p-2 mx-2 rounded-full h-full transition-colors`}
                >
                    {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                    ) : (
                        <Search className="h-5 w-5 text-white" />
                    )}
                </button>
            </motion.div>

            {/* Estado de carga */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className={`h-8 w-8 animate-spin mb-2`} />
                    <p className="">Buscando canciones...</p>
                </div>
            )}

            {/* Lista de resultados */}
            <div className="space-y-3">
                {results?.map((track, index) => (
                    <motion.div
                        key={track.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`rounded-xl shadow-sm border`}
                    >
                        {/* Contenido principal de la card */}
                        <div className="flex items-center p-4">
                            {/* Portada del álbum */}
                            <Image
                                width={56}
                                height={56}
                                src={track.album.cover_small}
                                alt={track.title}
                                className="w-14 h-14 rounded-lg shadow-md"
                            />

                            {/* Información de la canción */}
                            <div className="ml-4 flex-1 min-w-0">
                                <p className={`font-medium truncate`}>{track.title}</p>
                                <p className={`text-sm truncate`}>{track.artist.name}</p>
                            </div>

                            {/* Botones de acción */}
                            <div className="flex">
                                {/* Botón de reproducción */}
                                <button
                                    onClick={() => togglePlay(track)}
                                    disabled={loadingTrack === track.id}
                                    className={`p-2 rounded-full transition-colors`}
                                >
                                    {loadingTrack === track.id ? (
                                        <Loader2 className={`h-5 w-5 animate-spin`} />
                                    ) : playingTrack === track.id ? (
                                        <Pause className={`h-5 w-5`} />
                                    ) : (
                                        <Play className={`h-5 w-5`} />
                                    )}
                                </button>

                                {/* Botón de mensaje */}
                                <button
                                    onClick={() => toggleMessageInput(track.id)}
                                    className={`mr-2 p-2 rounded-full transition-colors`}
                                >
                                    <MessageSquarePlus className={`h-5 w-5`} />
                                </button>

                                {/* Botón de enviar */}
                                <button
                                    onClick={() => sendToDJ(track)}
                                    disabled={
                                        sendingTrack === track.id ||
                                        songsRequested >= maxSongs ||
                                        (lastRequestTime !== null && timeLeft > 0)
                                    }
                                    className={`p-2 rounded-full ${songsRequested >= maxSongs || (lastRequestTime && timeLeft > 0)
                                        ? "bg-gray-400 cursor-not-allowed"
                                        : "bg-gray-700 hover:bg-gray-600"
                                        } text-white transition-colors`}
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
                                <div className="relative mt-2">
                                    <input
                                        type="text"
                                        placeholder="Añade un mensaje para el DJ..."
                                        value={messageText}
                                        onChange={(e) => setMessageText(e.target.value)}
                                        className={`w-full px-4 py-2 pr-10 rounded-lg border focus:outline-none focus:ring-2`}
                                    />
                                    <button
                                        onClick={() => toggleMessageInput(track.id)}
                                        className="absolute right-2 top-2 p-1 rounded-full hover:bg-gray-600 hover:bg-opacity-30"
                                    >
                                        <X className="h-4 w-4 text-gray-500" />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Barra de progreso */}
                        {playingTrack === track.id && (
                            <div className="px-4 pb-2">
                                <div className="h-1 w-full bg-gray-600 dark:bg-gray-400 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gray-200 dark:bg-gray-700"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default MusicSearch;