"use client";

import { motion } from "framer-motion";
import Image from "next/image";

// Definir la interfaz de las props
interface DJInfoProps {
    djName: string;
    eventName: string;
}

const DJInfo: React.FC<DJInfoProps> = ({ djName, eventName }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative flex items-center justify-center bg-white p-4 bg-gradient-to-r mb-6 text-start gap-4 overflow-hidden"
        >
            {/* Resplandor animado */}
            {/* <motion.div
        animate={{ scale: [1, 2, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute m-auto w-40 h-40 bg-green-500 opacity-50 rounded-full blur-xl"
      /> */}

            {/* Ícono del DJ */}
            <motion.div className="flex items-center z-10">
                <Image
                    className="w-20 h-20 rounded-xl"
                    src="/images/juanvillegas.png"
                    width={80}
                    height={80}
                    alt="DJ"
                />
                {/* <CircleUser className="w-12 h-12 black-600" /> */}
            </motion.div>

            {/* Información del DJ */}
            <div className="z-10">
                <motion.h2
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="text-black text-2xl text-center font-bold mt-2"
                >
                    {djName}
                </motion.h2>
                <motion.p
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mt-1 px-2 py-0.5 text-white font-semibold bg-blue-500 rounded-full text-center text-base opacity-80"
                >
                    {eventName}
                </motion.p>
            </div>
        </motion.div>
    );
};

export default DJInfo;