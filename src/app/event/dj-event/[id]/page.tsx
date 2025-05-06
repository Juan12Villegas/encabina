"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { db, collection, query, where, getDocs, onSnapshot, doc, getDoc } from "@/../lib/firebase";
import Image from "next/image";
import { BadgeCheck, Check, Instagram, PartyPopper, MapPin, Disc3 } from "lucide-react";
import SearchMusic from "@/components/SearchMusic";

// Tipos para los datos de los eventos y DJs
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

/* interface EventDetailProps { } */

export default function EventDetail() {
    const { id } = useParams();
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

    // Variables de seguimiento para el console.log
    const [prevQrPaymentUrl, setPrevQrPaymentUrl] = useState<string | null>(null);
    const [prevAcceptPayment, setPrevAcceptPayment] = useState<boolean>(false);

    // Memoize the clean ID to avoid recalculating
    const cleanId = useMemo(() => {
        // Asegurarse de que id sea una cadena de texto
        if (typeof id === 'string' && (id.startsWith("DJ-") || id.startsWith("EV-"))) {
            return id.slice(3);
        }
        return id;
    }, [id]);

    const fetchDjData = useCallback(async (djId: string) => {
        try {
            const djRef = doc(db, "djs", djId);
            const djSnapshot = await getDoc(djRef);
            if (djSnapshot.exists()) {
                setDj(djSnapshot.data() as Dj);
            }

            // Obtener el plan del DJ desde la colección users
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("uid", "==", djId));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const userDoc = querySnapshot.docs[0];
                setDjPlan(userDoc.data().plan || "bassline"); // Default a bassline si no hay plan
                setQrPaymentUrl(userDoc.data().qrPaymentUrl || null); // Obtener el QR de pago
                setAcceptPayment(userDoc.data().showQR || false); // Obtener si acepta pagos

                // Solo loguear cuando los valores hayan cambiado
                if (userDoc.data().qrPaymentUrl !== prevQrPaymentUrl || userDoc.data().showQR !== prevAcceptPayment) {
                    console.log(userDoc.data().qrPaymentUrl, userDoc.data().showQR);
                    setPrevQrPaymentUrl(userDoc.data().qrPaymentUrl); // Actualizar valor previo de qrPaymentUrl
                    setPrevAcceptPayment(userDoc.data().showQR); // Actualizar valor previo de acceptPayment
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
    }, [qrPaymentUrl, acceptPayment]); // Este useEffect se ejecutará cuando qrPaymentUrl o acceptPayment cambien.    

    const fetchEventAndDj = useCallback(async () => {
        if (!id) return;

        try {
            const eventosRef = collection(db, "eventos");

            if (typeof id === 'string' && id.startsWith("EV-")) {
                // Caso para códigos QR (EV-)
                const q = query(eventosRef, where("qrCode", "==", cleanId));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    /* router.replace("/not-found"); */
                    return;
                }

                const eventoEnVivo = querySnapshot.docs.find(doc => doc.data().estado === "en vivo");
                if (!eventoEnVivo) {
                    /* router.replace("/not-found"); */
                    return;
                }

                setEvento(eventoEnVivo.data() as Evento);
                setEventId(eventoEnVivo.id);
                await fetchDjData(eventoEnVivo.data().djId);
            } else {
                // Caso para DJs (DJ- o sin prefijo)
                const q = typeof id === 'string' && id.startsWith("DJ-")
                    ? query(
                        eventosRef,
                        where("djId", "==", cleanId),
                        where("qrCode", "==", "")
                    )
                    : query(eventosRef, where("djId", "==", cleanId));

                const unsubscribe = onSnapshot(q, async (querySnapshot) => {
                    if (querySnapshot.empty) {
                        /* router.replace("/not-found"); */
                        return;
                    }

                    const eventoEnVivo = querySnapshot.docs.find(doc => doc.data().estado === "en vivo");
                    if (!eventoEnVivo) {
                        /* router.replace("/not-found"); */
                        return;
                    }

                    setEvento(eventoEnVivo.data() as Evento);
                    setEventId(eventoEnVivo.id);

                    // Solo buscamos el DJ si no tenemos la información ya cargada,
                    // o si el DJ actual no es el que está asignado al evento en vivo.
                    if (typeof id === 'string' && (!dj || dj.id !== eventoEnVivo.data().djId)) {
                        await fetchDjData(eventoEnVivo.data().djId);
                    }

                });

                return () => unsubscribe();
            }
        } catch (error) {
            console.error("Error obteniendo evento:", error);
            /* router.replace("/not-found"); */
        }
    }, [id, cleanId, fetchDjData, dj]);

    useEffect(() => {
        fetchEventAndDj();
    }, [fetchEventAndDj]);

    // Verificación de ubicación persistente
    useEffect(() => {
        const storedLocationStatus = localStorage.getItem(`locationVerified_${id}`);
        if (storedLocationStatus === "true") {
            setIsLocationVerified(true);
        }
    }, [id]);

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

    // Función para extraer el nombre de usuario de Instagram
    const extractInstagramUsername = useCallback((url: string) => {
        if (!url) return "No especificado";
        const match = url.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
        return match ? `@${match[1]}` : "No especificado";
    }, []);

    // Función para extraer el nombre de usuario de Tiktok
    const extractTiktokUsername = useCallback((url: string) => {
        if (!url) return "No especificado";

        const match = url.match(/tiktok\.com\/@?([a-zA-Z0-9_.]+)/);
        return match ? `@${match[1]}` : "No especificado";
    }, []);

    // Función para extraer el nombre de usuario de Facebook
    const extractFacebookUsername = useCallback((url: string) => {
        if (!url) return "No especificado";

        const match = url.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
        return match ? `@${match[1]}` : "No especificado";
    }, []);

    if (!evento) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 transition-colors duration-300">
                <div className="animate-pulse flex flex-col items-center">
                    <Disc3 className="h-12 w-12 text-gray-600 animate-spin" />
                    <p className="text-gray-600">Cargando evento...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen`}>
            {/* Contenido principal */}
            <main className="max-w-2xl mt-4 mx-auto px-4 pb-20 relative">
                {/* Banner */}
                <div className="w-full h-40 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-800">
                    <Image
                        src={bannerUrl || "/images/banner/banner-dj.png"}
                        alt="Banner"
                        width={1000}
                        height={1000}
                        className="object-cover w-full h-full"
                    />
                </div>

                {/* Avatar + Info */}
                <div className="relative flex flex-col items-center -mt-12 left-4 pr-8">
                    <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden shadow-md">
                        <Image
                            src={profileUrl || "/images/imageProfile.png"}
                            alt="Avatar"
                            width={100}
                            height={100}
                        />
                    </div>
                    <div className="mt-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                            <h1 className="text-2xl font-bold">{dj?.nombreDJ || "DJ"}</h1>
                            <BadgeCheck className="w-5 h-5 text-sky-500" />
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{dj?.descripcion || "Diseñando ritmos que te hacen vibrar."}</p>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col justify-center items-center">
                        <div className="flex flex-wrap justify-center items-center space-x-4 py-4">
                            <div>
                                {dj?.instagram && (
                                    <a
                                        href={dj?.instagram || "#"}
                                        target="_blank"
                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                                    >
                                        <Instagram className="w-4 h-4" />
                                        <span>{extractInstagramUsername(dj?.instagram || "")}</span>
                                    </a>
                                )}
                            </div>

                            <div>
                                {dj?.tiktok && (
                                    <a
                                        href={dj?.tiktok || "#"}
                                        target="_blank"
                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                                    >
                                        <Instagram className="w-4 h-4" />
                                        <span>{extractTiktokUsername(dj?.tiktok || "")}</span>
                                    </a>
                                )}
                            </div>

                            <div>
                                {dj?.facebook && (
                                    <a
                                        href={dj?.facebook || "#"}
                                        target="_blank"
                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                                    >
                                        <Instagram className="w-4 h-4" />
                                        <span>{extractFacebookUsername(dj?.facebook || "")}</span>
                                    </a>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-center text-center gap-4">
                            <div className="flex items-center gap-1 border px-2 py-1 rounded-full">
                                <PartyPopper className="w-4 h-4" />
                                <span className="font-semibold text-black text-sm">{evento?.nombre || "Evento sin título"}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-white border border-black bg-black px-2 py-1 rounded-full">
                                <MapPin className="w-4 h-4" />
                                <span>{evento?.lugar || "Ubicación no especificada"}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sección de solicitud de música */}
                <section className={`rounded-xl px-4 transition-colors duration-300 mt-8 shadow py-4`}>
                    {isLocationVerified && evento.ubicacion != null ? (
                        <>
                            <div className="flex items-center justify-center mb-6 text-green-600 dark:text-green-400">
                                <Check className="h-5 w-5" />
                                <span className="font-medium">Ubicación verificada</span>
                            </div>
                            <SearchMusic
                                eventId={eventId || ""}
                                qrPaymentUrl={qrPaymentUrl || ""}
                                acceptPayment={acceptPayment}
                                /* darkMode={darkMode} */
                                maxSongs={
                                    djPlan === "bassline" ? 50 :
                                        djPlan === "drop pro" ? 100 :
                                            Infinity // mainstage o cualquier otro caso
                                }
                            />
                        </>
                    ) : evento.ubicacion != null ? (
                        <>
                            <div className="text-center mb-6">
                                <h3 className={`text-lg font-bold mb-2 `}>Verifica tu ubicación</h3>
                                <p className={`text-sm mb-4`}>
                                    Necesitamos confirmar que estás en el evento para solicitar canciones.
                                </p>
                                <button
                                    onClick={() => setShowLocationModal(true)}
                                    className={`w-full py-3 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors duration-200 flex items-center justify-center gap-2`}
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
                            /* darkMode={darkMode} */
                            maxSongs={
                                djPlan === "bassline" ? 50 :
                                    djPlan === "drop pro" ? 100 :
                                        Infinity // mainstage o cualquier otro caso
                            }
                        />
                    )}
                </section>
            </main>

            {/* Modal de ubicación */}
            {showLocationModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
                    <div className={`rounded-xl shadow-xl p-6 w-full max-w-md transition-all duration-300`}>
                        <div className="text-center mb-6">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900 mb-4">
                                <MapPin className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
                            </div>
                            <h3 className={`text-xl font-bold mb-2`}>Verifica tu ubicación</h3>
                            <p className={`text-sm`}>
                                Necesitamos confirmar que estás en el evento para solicitar canciones.
                            </p>
                        </div>
                        <div className="flex gap-4 mt-6">
                            <button
                                onClick={() => setShowLocationModal(false)}
                                className={`flex-1 py-3 rounded-lg font-medium transition-colors duration-200`}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleRequestLocation}
                                className={`flex-1 py-3 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors duration-200 flex items-center justify-center gap-2`}
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