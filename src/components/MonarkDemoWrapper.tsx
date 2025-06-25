import React, { ReactNode } from "react";

interface MonarkBannerWrapperProps {
  children: ReactNode;
}

const MonarkBannerWrapper: React.FC<MonarkBannerWrapperProps> = ({
  children,
}) => {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">{children}</main>
      <div className="bg-white text-black py-2 px-4 flex justify-between items-center text-sm sm:text-base shadow-md border-t border-gray-200">
        <span>
          🚧 This is a demonstration to illustrate key project features.
        </span>
        <span className="font-semibold">
          Powered by <a className="text-primary hover:underline" href="https://monark.io" target="_blank">Monark</a>
        </span>
      </div>
    </div>
  );
};

export default MonarkBannerWrapper;