"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { db, collection, query, where, getDocs, onSnapshot, doc, getDoc } from "@/../lib/firebase";
import Image from "next/image";
import { BadgeCheck, Check, Instagram, PartyPopper, Music, MapPin, Disc3, QrCode } from "lucide-react";
import SearchMusic from "@/components/SearchMusic";

interface Evento {
    nombre: string;
    lugar: string;
    estado: string;
    ubicacion: { latitud: number; longitud: number } | null;
    qrCode: string;
    djId: string;
}

interface Dj {
    id: string;
    nombreDJ: string;
    descripcion: string;
    instagram: string;
    tiktok: string;
    facebook: string;
    profileUrl: string;
    bannerUrl: string;
}

type DjPlan = "bassline" | "drop pro" | "mainstage" | "other";

export default function EventDetail() {
    const { id } = useParams();
    /* const router = useRouter(); */
    const [evento, setEvento] = useState<Evento | null>(null);
    const [eventId, setEventId] = useState<string | null>(null);
    const [profileUrl, setProfileUrl] = useState<string | null>(null);
    const [bannerUrl, setBannerUrl] = useState<string | null>(null);
    const [qrPaymentUrl, setQrPaymentUrl] = useState<string | null>(null);
    const [acceptPayment, setAcceptPayment] = useState<boolean>(false);
    const [dj, setDj] = useState<Dj | null>(null);
    const [djPlan, setDjPlan] = useState<DjPlan | null>(null);
    const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
    const [isLocationVerified, setIsLocationVerified] = useState<boolean>(false);
    const [invalidCode, setInvalidCode] = useState<boolean>(false);
    const [eventNotFound, setEventNotFound] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);

    const [prevQrPaymentUrl, setPrevQrPaymentUrl] = useState<string | null>(null);
    const [prevAcceptPayment, setPrevAcceptPayment] = useState<boolean>(false);

    const cleanId = useMemo(() => {
        if (typeof id === 'string') {
            if (id.startsWith("DJ-") || id.startsWith("EV-")) {
                return id.slice(3);
            } else {
                setInvalidCode(true);
                setLoading(false);
                return null;
            }
        }
        setInvalidCode(true);
        setLoading(false);
        return null;
    }, [id]);

    const fetchDjData = useCallback(async (djId: string) => {
        try {
            const djRef = doc(db, "djs", djId);
            const djSnapshot = await getDoc(djRef);
            if (djSnapshot.exists()) {
                setDj(djSnapshot.data() as Dj);
            }

            const usersRef = collection(db, "users");
            const q = query(usersRef, where("uid", "==", djId));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const userDoc = querySnapshot.docs[0];
                setDjPlan(userDoc.data().plan || "bassline");
                setQrPaymentUrl(userDoc.data().qrPaymentUrl || null);
                setAcceptPayment(userDoc.data().showQR || false);

                if (userDoc.data().qrPaymentUrl !== prevQrPaymentUrl || userDoc.data().showQR !== prevAcceptPayment) {
                    setPrevQrPaymentUrl(userDoc.data().qrPaymentUrl);
                    setPrevAcceptPayment(userDoc.data().showQR);
                }

                if (userDoc.data().profileUrl && userDoc.data().showProfile === true) {
                    setProfileUrl(userDoc.data().profileUrl || '/images/imageProfile.png');
                }

                if (userDoc.data().bannerUrl && userDoc.data().showBanner === true) {
                    setBannerUrl(userDoc.data().bannerUrl || '/images/banner/banner-dj.png');
                }
            }
        } catch (error) {
            console.error("Error obteniendo DJ:", error);
        }
    }, [prevQrPaymentUrl, prevAcceptPayment]);

    useEffect(() => {
        console.log("qrPaymentUrl or acceptPayment changed:", qrPaymentUrl, acceptPayment);
    }, [qrPaymentUrl, acceptPayment]);

    const fetchEventAndDj = useCallback(async () => {
        if (!cleanId) return;

        try {
            const eventosRef = collection(db, "eventos");

            if (typeof id === 'string' && id.startsWith("EV-")) {
                const q = query(eventosRef, where("qrCode", "==", cleanId));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    setEventNotFound(true);
                    setLoading(false);
                    return;
                }

                const eventoEnVivo = querySnapshot.docs.find(doc => doc.data().estado === "en vivo");
                if (!eventoEnVivo) {
                    setEventNotFound(true);
                    setLoading(false);
                    return;
                }

                setEvento(eventoEnVivo.data() as Evento);
                setEventId(eventoEnVivo.id);
                await fetchDjData(eventoEnVivo.data().djId);
                setLoading(false);
            } else {
                const q = typeof id === 'string' && id.startsWith("DJ-")
                    ? query(
                        eventosRef,
                        where("djId", "==", cleanId),
                        where("qrCode", "==", "")
                    )
                    : query(eventosRef, where("djId", "==", cleanId));

                const unsubscribe = onSnapshot(q, async (querySnapshot) => {
                    if (querySnapshot.empty) {
                        setEventNotFound(true);
                        setLoading(false);
                        return;
                    }

                    const eventoEnVivo = querySnapshot.docs.find(doc => doc.data().estado === "en vivo");
                    if (!eventoEnVivo) {
                        setEventNotFound(true);
                        setLoading(false);
                        return;
                    }

                    setEvento(eventoEnVivo.data() as Evento);
                    setEventId(eventoEnVivo.id);

                    if (typeof id === 'string' && (!dj || dj.id !== eventoEnVivo.data().djId)) {
                        await fetchDjData(eventoEnVivo.data().djId);
                    }
                    setLoading(false);
                });

                return () => unsubscribe();
            }
        } catch (error) {
            console.error("Error obteniendo evento:", error);
            setEventNotFound(true);
            setLoading(false);
        }
    }, [id, cleanId, fetchDjData, dj]);

    useEffect(() => {
        fetchEventAndDj();
    }, [fetchEventAndDj]);

    useEffect(() => {
        const storedLocationStatus = localStorage.getItem(`locationVerified_${id}`);
        if (storedLocationStatus === "true") {
            setIsLocationVerified(true);
        }
    }, [id]);

    const showErrorView = invalidCode || eventNotFound;

    const isWithinRadius = (lat1: number, lon1: number, lat2: number, lon2: number, radius: number) => {
        const toRad = (value: number) => (value * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance <= radius;
    };

    const handleRequestLocation = useCallback(() => {
        if (!("geolocation" in navigator)) {
            alert("Tu navegador no soporta geolocalización.");
            return;
        }

        navigator.permissions.query({ name: "geolocation" }).then((result) => {
            if (result.state === "denied") {
                alert("Tienes bloqueada la ubicación. Habilítala en la configuración del navegador.");
            } else {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        if (evento?.ubicacion?.latitud && evento?.ubicacion?.longitud) {
                            const isValid = isWithinRadius(
                                latitude,
                                longitude,
                                evento.ubicacion.latitud,
                                evento.ubicacion.longitud,
                                1
                            );
                            if (isValid) {
                                localStorage.setItem(`locationVerified_${id}`, "true");
                                setIsLocationVerified(true);
                                setShowLocationModal(false);
                            } else {
                                alert("Debes estar dentro del radio del evento para solicitar música.");
                            }
                        } else {
                            alert("No se pudo obtener la ubicación del evento.");
                        }
                    },
                    (error) => {
                        console.error("Error obteniendo ubicación:", error);
                        alert("Error al obtener la ubicación.");
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            }
        });
    }, [evento, id]);

    /* const extractInstagramUsername = useCallback((url: string) => {
        if (!url) return "No especificado";
        const match = url.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
        return match ? `@${match[1]}` : "No especificado";
    }, []);

    const extractTiktokUsername = useCallback((url: string) => {
        if (!url) return "No especificado";
        const match = url.match(/tiktok\.com\/@?([a-zA-Z0-9_.]+)/);
        return match ? `@${match[1]}` : "No especificado";
    }, []);

    const extractFacebookUsername = useCallback((url: string) => {
        if (!url) return "No especificado";
        const match = url.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
        return match ? `@${match[1]}` : "No especificado";
    }, []); */

    if (showErrorView) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4 text-center">
                <div className="max-w-md mx-auto">
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-6">
                        <div className="flex justify-center mb-4">
                            <QrCode className="h-12 w-12 text-red-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-3">
                            {invalidCode ? "Código no válido" : "Evento no encontrado"}
                        </h2>
                        <p className="text-gray-400 mb-6">
                            {invalidCode
                                ? "El código escaneado no es válido. Por favor, escanea nuevamente el código QR del evento."
                                : "El evento no existe o ya ha culminado. Por favor, verifica el código e intenta nuevamente."}
                        </p>
                        {/* <button
                            onClick={() => router.push('/')}
                            className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
                        >
                            Volver al inicio
                        </button> */}
                    </div>

                    <div className="text-gray-500 text-sm">
                        <p>Si el problema persiste, contacta al organizador del evento.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900">
                <div className="animate-pulse flex flex-col items-center">
                    <Disc3 className="h-12 w-12 text-purple-500 animate-spin" />
                    <p className="text-gray-400 mt-2">Cargando evento...</p>
                </div>
            </div>
        );
    }

    if (invalidCode) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4 text-center">
                <div className="max-w-md mx-auto">
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-6">
                        <div className="flex justify-center mb-4">
                            <QrCode className="h-12 w-12 text-red-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-3">Código no válido</h2>
                        <p className="text-gray-400 mb-6">
                            El código escaneado no es válido o el evento ha culminado.
                            Por favor, escanea nuevamente el código QR del evento.
                        </p>
                        {/* <button
                            onClick={() => router.push('/')}
                            className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
                        >
                            Volver al inicio
                        </button> */}
                    </div>

                    <div className="text-gray-500 text-sm">
                        <p>Si el problema persiste, contacta al organizador del evento.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!evento) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900">
                <div className="animate-pulse flex flex-col items-center">
                    <Disc3 className="h-12 w-12 text-purple-500 animate-spin" />
                    <p className="text-gray-400 mt-2">Cargando evento...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
            {/* Banner con overlay */}
            <div className="relative h-48 w-full overflow-hidden">
                <Image
                    src={bannerUrl || "/images/banner/banner-dj.png"}
                    alt="Banner del evento"
                    width={1200}
                    height={400}
                    className="object-cover w-full h-full"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
            </div>

            {/* Contenido principal */}
            <div className="relative px-4 pb-20 max-w-2xl mx-auto -mt-16">
                {/* Perfil del DJ */}
                <div className="flex flex-col items-center">
                    <div className="relative -mt-16">
                        <div className="w-28 h-28 rounded-full border-4 border-gray-800 overflow-hidden shadow-xl">
                            <Image
                                src={profileUrl || "/images/imageProfile.png"}
                                alt="Foto del DJ"
                                width={112}
                                height={112}
                                className="object-cover w-full h-full"
                            />
                        </div>
                        <div className="absolute bottom-0 right-0 bg-purple-600 p-1 rounded-full">
                            <Music className="h-5 w-5 text-white" />
                        </div>
                    </div>

                    <div className="mt-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                            <h1 className="text-2xl font-bold">{dj?.nombreDJ || "DJ"}</h1>
                            <BadgeCheck className="w-5 h-5 text-purple-400" />
                        </div>
                        <p className="text-gray-400 text-sm mt-1 max-w-md">
                            {dj?.descripcion || "Diseñando ritmos que te hacen vibrar."}
                        </p>
                    </div>

                    {/* Redes sociales */}
                    <div className="flex gap-4 mt-4">
                        {dj?.instagram && (
                            <a
                                href={dj.instagram}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                            >
                                <Instagram className="h-5 w-5 text-pink-500" />
                            </a>
                        )}
                        {dj?.tiktok && (
                            <a
                                href={dj.tiktok}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                            >
                                <svg className="h-5 w-5 text-black dark:text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                                </svg>
                            </a>
                        )}
                        {dj?.facebook && (
                            <a
                                href={dj.facebook}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                            >
                                <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                                </svg>
                            </a>
                        )}
                    </div>

                    {/* Info del evento */}
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-full">
                            <PartyPopper className="h-4 w-4 text-purple-400" />
                            <span className="font-medium text-sm">{evento.nombre || "Evento sin título"}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-full">
                            <MapPin className="h-4 w-4 text-purple-400" />
                            <span className="text-sm">{evento.lugar || "Ubicación no especificada"}</span>
                        </div>
                    </div>
                </div>

                {/* Sección de solicitud de música */}
                <div className="mt-8 bg-gray-800 rounded-xl p-4 shadow-lg">
                    {isLocationVerified && evento.ubicacion != null ? (
                        <>
                            <div className="flex items-center justify-center gap-2 mb-6 text-green-400">
                                <Check className="h-5 w-5" />
                                <span className="font-medium">Ubicación verificada</span>
                            </div>
                            <SearchMusic
                                eventId={eventId || ""}
                                qrPaymentUrl={qrPaymentUrl || ""}
                                acceptPayment={acceptPayment}
                                maxSongs={
                                    djPlan === "bassline" ? 50 :
                                        djPlan === "drop pro" ? 100 :
                                            Infinity
                                }
                            />
                        </>
                    ) : evento.ubicacion != null ? (
                        <>
                            <div className="text-center">
                                <h3 className="text-lg font-bold mb-2">Verifica tu ubicación</h3>
                                <p className="text-gray-400 mb-6">
                                    Necesitamos confirmar que estás en el evento para solicitar canciones.
                                </p>
                                <button
                                    onClick={() => setShowLocationModal(true)}
                                    className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <MapPin className="h-5 w-5" />
                                    Verificar ubicación
                                </button>
                            </div>
                        </>
                    ) : (
                        <SearchMusic
                            eventId={eventId || ""}
                            qrPaymentUrl={qrPaymentUrl || ""}
                            acceptPayment={acceptPayment}
                            maxSongs={
                                djPlan === "bassline" ? 50 :
                                    djPlan === "drop pro" ? 100 :
                                        Infinity
                            }
                        />
                    )}
                </div>
            </div>

            {/* Modal de ubicación */}
            {showLocationModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full border border-gray-700">
                        <div className="text-center mb-6">
                            <div className="mx-auto bg-purple-600/20 p-3 rounded-full w-max mb-4">
                                <MapPin className="h-6 w-6 text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Verifica tu ubicación</h3>
                            <p className="text-gray-400">
                                Necesitamos confirmar que estás en el evento para solicitar canciones.
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowLocationModal(false)}
                                className="flex-1 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleRequestLocation}
                                className="flex-1 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors flex items-center justify-center gap-2"
                            >
                                <Check className="h-5 w-5" />
                                Verificar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}