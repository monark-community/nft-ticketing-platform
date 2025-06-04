
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";

const Hero = () => {
  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="container mx-auto max-w-6xl text-center relative z-10">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-800 mb-6 leading-tight">
          The Future of
          <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent block">
            Event Ticketing
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
          Create, sell, and verify NFT tickets with blockchain technology. 
          Eliminate fraud, control resales, and reward your community.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link to="/dashboard">
            <Button size="lg" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-4 text-lg w-full sm:w-auto group">
              Get Started
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          
          <Button size="lg" variant="outline" className="px-8 py-4 text-lg w-full sm:w-auto group border-2 border-purple-200 hover:border-purple-400">
            <Play className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" />
            Watch Demo
          </Button>
        </div>

        {/* Hero Image/Illustration Placeholder */}
        <div className="relative mx-auto max-w-4xl">
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl p-8 backdrop-blur-sm border border-white/50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white/80 rounded-lg p-6 shadow-lg">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg mb-4"></div>
                <h3 className="font-semibold text-gray-800 mb-2">Create Event</h3>
                <p className="text-sm text-gray-600">Design and mint your NFT tickets</p>
              </div>
              
              <div className="bg-white/80 rounded-lg p-6 shadow-lg">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg mb-4"></div>
                <h3 className="font-semibold text-gray-800 mb-2">Sell Tickets</h3>
                <p className="text-sm text-gray-600">List on marketplace with smart contracts</p>
              </div>
              
              <div className="bg-white/80 rounded-lg p-6 shadow-lg">
                <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg mb-4"></div>
                <h3 className="font-semibold text-gray-800 mb-2">Verify Entry</h3>
                <p className="text-sm text-gray-600">Scan QR codes for instant validation</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Background Elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-40 right-10 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>
    </section>
  );
};

export default Hero;
