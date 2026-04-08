import React from 'react';
import logoUrl from '../assets/images/logo.svg';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = "", size = "md", showText = true }) => {
  const sizes = {
    sm: { icon: "w-11 h-11", text: "text-lg" },
    md: { icon: "w-20 h-20", text: "text-2xl" },
    lg: { icon: "w-28 h-28", text: "text-4xl" },
    xl: { icon: "w-40 h-40", text: "text-5xl" }
  };

  if (!showText) {
    return (
      <div className={`${sizes[size].icon} relative flex items-center justify-center ${className}`}>
        <img
          src={logoUrl}
          alt="AA2000 logo"
          className="w-full h-full drop-shadow-md"
          draggable={false}
        />
      </div>
    );
  }

  const textEl = (
    <div className={`font-black tracking-tighter italic text-blue-900 dark:text-blue-300 ${sizes[size].text}`}>
      AA<span className="text-blue-600">2000</span>
    </div>
  );

  // Navbar: logo left, text on the right with a little space (size="sm")
  if (size === "sm") {
    return (
      <div className={`flex flex-row items-center justify-center shrink-0 gap-2 ${className}`}>
        <div className={`${sizes[size].icon} flex shrink-0 items-center justify-center`}>
          <img src={logoUrl} alt="" className="w-full h-full drop-shadow-md" draggable={false} aria-hidden />
        </div>
        {textEl}
      </div>
    );
  }

  // Login page and others: logo on top, text under with space (size="md" | "lg" | "xl")
  return (
    <div className={`flex flex-col items-center justify-center shrink-0 gap-3 ${className}`}>
      <div className={`${sizes[size].icon} flex shrink-0 items-center justify-center`}>
        <img src={logoUrl} alt="AA2000 logo" className="w-full h-full drop-shadow-md" draggable={false} />
      </div>
      {textEl}
    </div>
  );
};

export default Logo;
