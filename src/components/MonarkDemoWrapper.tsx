import React, { ReactNode } from "react";

interface MonarkBannerWrapperProps {
  children: ReactNode;
}

const MonarkBannerWrapper: React.FC<MonarkBannerWrapperProps> = ({
  children,
}) => {
  return (
    <div className="fixed top-0 left-0 w-full z-[100]">
      <div className="bg-white text-black py-2 px-4 flex justify-between items-center text-sm sm:text-base shadow-md z-50">
        <span>
          🚧 This is a demonstration to illustrate key project features.
        </span>
        <span className="font-semibold">
          Powered by <a className="text-primary hover:underline" href="https://monark.io" target="_blank">Monark</a>
        </span>
      </div>
      <main className="relative z-10 overflow-hidden">{children}</main>
    </div>
  );
};

export default MonarkBannerWrapper;