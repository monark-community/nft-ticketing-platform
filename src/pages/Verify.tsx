
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QrCode, Scan, CheckCircle, XCircle, Wallet } from "lucide-react";
import Header from "@/components/Header";

const Verify = () => {
  const [qrResult, setQrResult] = useState<string>("");
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    ticket?: {
      eventTitle: string;
      date: string;
      location: string;
      ticketId: string;
      owner: string;
    };
    message: string;
  } | null>(null);

  const handleQrScan = () => {
    // Simulate QR code scanning
    const mockTicketData = {
      valid: Math.random() > 0.3, // 70% chance of valid ticket
      ticket: {
        eventTitle: "Summer Music Festival 2024",
        date: "2024-07-15",
        location: "Central Park, NYC",
        ticketId: "#NFT001",
        owner: "0x1234...5678"
      },
      message: Math.random() > 0.3 ? "Ticket verified successfully!" : "Invalid or expired ticket"
    };
    
    setVerificationResult(mockTicketData);
  };

  const handleWalletVerify = () => {
    // Simulate wallet signature verification
    const mockVerification = {
      valid: Math.random() > 0.2, // 80% chance of valid
      ticket: {
        eventTitle: "Tech Conference 2024",
        date: "2024-08-20",
        location: "Convention Center, SF",
        ticketId: "#NFT042",
        owner: "0x9876...5432"
      },
      message: Math.random() > 0.2 ? "Wallet signature verified!" : "Signature verification failed"
    };
    
    setVerificationResult(mockVerification);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      <Header />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Ticket Verification</h1>
          <p className="text-gray-600">Verify NFT tickets using QR codes or wallet signatures</p>
        </div>

        <Card className="bg-white/80 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scan className="h-6 w-6 text-purple-600" />
              Verification Methods
            </CardTitle>
            <CardDescription>
              Choose your preferred method to verify ticket authenticity
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="qr" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="qr" className="flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  QR Code Scan
                </TabsTrigger>
                <TabsTrigger value="wallet" className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Wallet Signature
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="qr" className="space-y-6">
                <div className="text-center">
                  <div className="bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg p-8 mb-6">
                    <QrCode className="h-24 w-24 text-purple-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">QR Code Scanner</h3>
                    <p className="text-gray-600 mb-4">
                      Position the QR code from the ticket within the scanner area
                    </p>
                    <Button 
                      onClick={handleQrScan}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                    >
                      <Scan className="h-4 w-4 mr-2" />
                      Start Scanning
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="manual-qr">Or enter QR code manually:</Label>
                    <div className="flex gap-2">
                      <Input
                        id="manual-qr"
                        placeholder="Enter QR code data..."
                        value={qrResult}
                        onChange={(e) => setQrResult(e.target.value)}
                      />
                      <Button 
                        onClick={handleQrScan}
                        variant="outline"
                        className="border-purple-200 hover:border-purple-400"
                      >
                        Verify
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="wallet" className="space-y-6">
                <div className="text-center">
                  <div className="bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg p-8 mb-6">
                    <Wallet className="h-24 w-24 text-purple-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Wallet Verification</h3>
                    <p className="text-gray-600 mb-4">
                      Connect your wallet and sign a message to verify ticket ownership
                    </p>
                    <Button 
                      onClick={handleWalletVerify}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                    >
                      <Wallet className="h-4 w-4 mr-2" />
                      Connect & Verify
                    </Button>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    <p>This method verifies that you own the NFT ticket in your connected wallet.</p>
                    <p>No transaction fees required - just a signature verification.</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Verification Result */}
            {verificationResult && (
              <div className="mt-8 p-6 border-t">
                <div className={`text-center p-6 rounded-lg ${
                  verificationResult.valid 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex justify-center mb-4">
                    {verificationResult.valid ? (
                      <CheckCircle className="h-16 w-16 text-green-600" />
                    ) : (
                      <XCircle className="h-16 w-16 text-red-600" />
                    )}
                  </div>
                  
                  <h3 className={`text-xl font-semibold mb-2 ${
                    verificationResult.valid ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {verificationResult.valid ? 'Ticket Verified!' : 'Verification Failed'}
                  </h3>
                  
                  <p className={`mb-4 ${
                    verificationResult.valid ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {verificationResult.message}
                  </p>

                  {verificationResult.valid && verificationResult.ticket && (
                    <div className="bg-white rounded-lg p-4 space-y-2 text-left max-w-md mx-auto">
                      <div className="text-center mb-3">
                        <h4 className="font-semibold text-gray-800">Ticket Details</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-gray-600">Event:</span>
                        <span className="font-medium">{verificationResult.ticket.eventTitle}</span>
                        
                        <span className="text-gray-600">Date:</span>
                        <span className="font-medium">{verificationResult.ticket.date}</span>
                        
                        <span className="text-gray-600">Location:</span>
                        <span className="font-medium">{verificationResult.ticket.location}</span>
                        
                        <span className="text-gray-600">Ticket ID:</span>
                        <span className="font-medium">{verificationResult.ticket.ticketId}</span>
                        
                        <span className="text-gray-600">Owner:</span>
                        <span className="font-medium">{verificationResult.ticket.owner}</span>
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={() => setVerificationResult(null)}
                    className="mt-4"
                    variant="outline"
                  >
                    Verify Another Ticket
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Verify;
