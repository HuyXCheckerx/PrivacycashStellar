import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal as TerminalIcon, Shield, Cpu, Lock, Send, Download, HelpCircle, Key, RefreshCcw, Check, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TerminalLine, MetaKeypair, Nomination } from '../../types';

// Import real logic
import { generateMetaKey, deriveStealthAddress, checkStealthAddress, recoverMetaKey } from '../../lib/crypto';
import { submitDepositTx, submitWithdrawTx, scanBlockchainForStealthEvents } from '../../lib/soroban';
import { isConnected, requestAccess } from '@stellar/freighter-api';

export const Terminal: React.FC = () => {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [metaKey, setMetaKey] = useState<MetaKeypair | null>(null);
  
  // Real App States
  const [freighterPubKey, setFreighterPubKey] = useState<string | null>(null);
  const [scannedFunds, setScannedFunds] = useState<any[]>([]);
  const [selectedFundIndex, setSelectedFundIndex] = useState<number | null>(null);

  // Deposit Protocol States
  const [targetMetaKey, setTargetMetaKey] = useState<string>('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);

  // Key Management & Withdraw States
  const [importKeyInput, setImportKeyInput] = useState<string>('');
  const [withdrawDest, setWithdrawDest] = useState<string>('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addLine(`${label} COPIED TO CLIPBOARD.`, 'success');
  };

  const addLine = (content: string, type: TerminalLine['type'] = 'output') => {
    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        content,
        type,
        timestamp: Date.now(),
      },
    ].slice(-50));
  };

  useEffect(() => {
    const bootSequence = [
      'INITIALIZING PRIVACY PROTOCOL...',
      'LOADING SOROBAN RUNTIME ENVIRONMENT...',
      'ESTABLISHING STELLAR HORIZON CONNECTION...',
      'READY. TERMINAL ACTIVE.',
    ];

    let delay = 0;
    bootSequence.forEach((text, i) => {
      setTimeout(() => {
        addLine(text, i === 3 ? 'success' : 'output');
      }, delay);
      delay += 300 + Math.random() * 400;
    });

    const savedKey = localStorage.getItem('stellar_privacy_meta_key');
    if (savedKey) {
      setMetaKey(JSON.parse(savedKey));
    }

    // Auto-check connection
    isConnected().then((res: any) => {
      if (res.isConnected || res === true) {
        addLine('FREIGHTER EXTENSION DETECTED.', 'success');
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleCommand = async (cmd: string) => {
    const parts = cmd.trim().split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    addLine(`> ${cmd}`, 'input');

    switch (command) {
      case 'help':
        addLine('AVAILABLE COMMANDS:');
        addLine('  CONNECT         - Connect Freighter wallet');
        addLine('  KEYGEN          - Generate new meta keypair');
        addLine('  IMPORT <key>    - Import existing public meta key');
        addLine('  SET_SECRET <sk> - Set private meta key');
        addLine('  DEPOSIT <amt>   - Deposit funds (100, 1000, 10000, 100000)');
        addLine('  SCAN            - Scan blockchain for stealth funds');
        addLine('  WITHDRAW <addr> - Withdraw scanned funds to address');
        addLine('  STATUS          - View current key and session data');
        addLine('  CLEAR           - Clear terminal');
        break;

      case 'clear':
        setLines([]);
        break;

      case 'connect':
        setIsProcessing(true);
        addLine('REQUESTING WALLET ACCESS...', 'warning');
        try {
          const response: any = await requestAccess();
          if (response.error) {
            addLine(`ACCESS DENIED: ${response.error}`, 'error');
          } else {
            const pubKey = response.address || response.publicKey || (typeof response === 'string' ? response : JSON.stringify(response));
            setFreighterPubKey(pubKey);
            addLine(`CONNECTED: ${pubKey.slice(0,10)}...`, 'success');
          }
        } catch (e: any) {
          addLine(`CONNECTION FAILED: ${e.message}`, 'error');
        } finally {
          setIsProcessing(false);
        }
        break;

      case 'keygen':
        setIsProcessing(true);
        addLine('GENERATING SECURE ENTROPY...', 'warning');
        setTimeout(() => {
          const newKey = generateMetaKey();
          setMetaKey({ publicKey: newKey.publicKeyHex, privateKey: newKey.privateKeyHex });
          localStorage.setItem('stellar_privacy_meta_key', JSON.stringify({ publicKey: newKey.publicKeyHex, privateKey: newKey.privateKeyHex }));
          addLine('META KEYPAIR GENERATED SUCCESSFULLY.', 'success');
          addLine(`PUB: ${newKey.publicKeyHex.slice(0, 10)}...${newKey.publicKeyHex.slice(-10)}`);
          setIsProcessing(false);
        }, 500);
        break;

      case 'status':
        addLine('--- SESSION STATUS ---');
        addLine(`WALLET: ${freighterPubKey ? freighterPubKey.slice(0,12) + '...' : 'DISCONNECTED'}`);
        if (!metaKey) {
          addLine('META KEY: NONE', 'error');
        } else {
          addLine(`PUBLIC META: ${metaKey.publicKey.slice(0, 16)}...`);
          addLine(`PRIVATE META: ${metaKey.privateKey ? '********' : 'NOT SET'}`);
        }
        addLine(`SCANNED FUNDS: ${scannedFunds.length} CLUSTERS READY`);
        break;

      case 'deposit':
        if (!freighterPubKey) {
          addLine('ERROR: MUST CONNECT WALLET FIRST (CMD: CONNECT).', 'error');
          break;
        }
        const amount = parseInt(args[0]);
        const targetPubKey = args[1] || metaKey?.publicKey;

        if (!targetPubKey) {
          addLine('ERROR: TARGET META KEY REQUIRED. SPECIFY TARGET OR GENERATE YOUR OWN FIRST.', 'error');
          break;
        }

        const validNominations: Nomination[] = [100, 1000, 10000, 100000];
        
        if (!validNominations.includes(amount as Nomination)) {
          addLine('INVALID NOMINATION. CHOOSE: 100, 1000, 10000, 100000', 'error');
        } else {
          setIsProcessing(true);
          addLine(`DERIVING ONE-TIME STEALTH ADDRESS...`, 'warning');
          try {
            const sendResult = deriveStealthAddress(targetPubKey);
            addLine(`DEPOSITING ${amount} XLM... PLEASE SIGN IN FREIGHTER.`, 'warning');
            
            const hash = await submitDepositTx(
              freighterPubKey,
              sendResult.stealthAddress,
              sendResult.ephemeralPubHex,
              sendResult.encryptedSeedHex,
              amount.toString()
            );
            
            addLine(`TX CONFIRMED: ${hash.slice(0, 12)}...`, 'success');
            addLine('ANONYMITY SET UPDATED.', 'success');
          } catch (e: any) {
            addLine(`FAILED: ${e.message}`, 'error');
          } finally {
            setIsProcessing(false);
          }
        }
        break;

      case 'scan':
        if (!metaKey || !metaKey.privateKey) {
          addLine('ERROR: PRIVATE META KEY REQUIRED TO SCAN.', 'error');
          break;
        }
        setIsProcessing(true);
        addLine('SCANNING BLOCKCHAIN EVENTS...', 'warning');
        try {
          const events = await scanBlockchainForStealthEvents();
          addLine(`FETCHED ${events.length} STEALTH EVENTS. DECRYPTING...`, 'output');
          
          const foundFunds = [];
          for (let evt of events) {
            const check = checkStealthAddress(evt.ephemeralPubHex, evt.encryptedSeedHex, metaKey.privateKey);
            if (check && check.stealthAddress === evt.stealthAddress) {
              foundFunds.push(check);
            }
          }

          if (foundFunds.length > 0) {
            setScannedFunds(foundFunds);
            addLine(`LOCATED AND DECRYPTED ${foundFunds.length} FUND CLUSTER(S).`, 'success');
            addLine('READY FOR WITHDRAWAL.', 'success');
          } else {
            addLine('NO MATCHING FUNDS FOUND FOR THIS META KEY.', 'error');
          }
        } catch (e: any) {
          addLine(`SCAN FAILED: ${e.message}`, 'error');
        } finally {
          setIsProcessing(false);
        }
        break;

      case 'withdraw':
        if (scannedFunds.length === 0) {
          addLine('ERROR: NO FUNDS SCANNED. RUN `SCAN` FIRST.', 'error');
          break;
        }
        if (selectedFundIndex === null || selectedFundIndex >= scannedFunds.length) {
          addLine('ERROR: NO FUND CLUSTER SELECTED.', 'error');
          break;
        }
        const dest = args[0] || withdrawDest;
        if (!dest) {
          addLine('USAGE: WITHDRAW <ADDR>', 'error');
        } else {
          setIsProcessing(true);
          addLine('CONSTRUCTING ZK-PROOF PAYLOAD...', 'warning');
          try {
            const targetFund = scannedFunds[selectedFundIndex];
            const hash = await submitWithdrawTx(targetFund.stealthSeedSecret, dest);
            addLine('WITHDRAWAL EXECUTED SUCCESSFULLY.', 'success');
            addLine(`TX ID: ${hash.slice(0, 12)}...`, 'success');
            
            // Remove the withdrawn fund from the array
            const newFunds = [...scannedFunds];
            newFunds.splice(selectedFundIndex, 1);
            setScannedFunds(newFunds);
            setSelectedFundIndex(null);
          } catch (e: any) {
            addLine(`FAILED: ${e.message}`, 'error');
          } finally {
            setIsProcessing(false);
          }
        }
        break;

      case 'import':
        const pubKey = args[0];
        if (!pubKey || pubKey.length < 50) {
          addLine('INVALID PUBKEY.', 'error');
        } else {
          const importedKey: MetaKeypair = { publicKey: pubKey, privateKey: '' };
          setMetaKey(importedKey);
          localStorage.setItem('stellar_privacy_meta_key', JSON.stringify(importedKey));
          addLine(`IMPORTED: ${pubKey.slice(0, 10)}...`, 'success');
        }
        break;

      case 'set_secret':
        const secretKey = args[0];
        if (!secretKey) {
          addLine('USAGE: SET_SECRET <SK>', 'error');
        } else {
          try {
            const recovered = recoverMetaKey(secretKey);
            setMetaKey({ publicKey: recovered.publicKeyHex, privateKey: recovered.privateKeyHex });
            localStorage.setItem('stellar_privacy_meta_key', JSON.stringify({ publicKey: recovered.publicKeyHex, privateKey: recovered.privateKeyHex }));
            addLine('META KEY RECOVERED AND LOADED.', 'success');
          } catch (e) {
            addLine('FAILED TO RECOVER KEY. INVALID HEX.', 'error');
          }
        }
        break;

      default:
        addLine(`UNKNOWN: ${command}`, 'error');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      handleCommand(input);
      setInput('');
    }
  };

  useEffect(() => {
    if (!isProcessing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isProcessing]);

  return (
    <div 
      className="w-full h-screen bg-transparent text-[#E0E0E0] font-mono p-8 flex flex-col overflow-hidden"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Header Section */}
      <header className="border-b border-[#333] pb-6 mb-8 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-[#00FFA3] uppercase">
            PRIVACYCASH<span className="text-white">.STELLAR</span>
          </h1>
          <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">
            NON-CUSTODIAL PRIVACY PROTOCOL v1.0.4 // LAYER: SOROBAN
          </p>
        </div>
        <div className="flex gap-8 text-[10px] uppercase tracking-widest">
          <div className="flex flex-col items-end">
            <span className="text-gray-500 mb-1">Wallet Status</span>
            {freighterPubKey ? (
              <span className="text-[#00FFA3] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00FFA3]" />
                {freighterPubKey.slice(0,8)}...
              </span>
            ) : (
              <span className="text-red-400 cursor-pointer hover:text-white transition-colors" onClick={() => handleCommand('connect')}>
                DISCONNECTED (CLICK TO CONNECT)
              </span>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-gray-500 mb-1">Relayer Fee</span>
            <span className="text-white">0.5% XLM</span>
          </div>
        </div>
      </header>

      {/* Main Control Grid */}
      <div className="grid grid-cols-3 gap-8 flex-grow overflow-hidden mb-8">
        
        {/* 01. Key Management */}
        <section className="border border-[#333] p-6 flex flex-col bg-[#0A0A0A]/80 backdrop-blur-sm relative overflow-hidden group hover:border-[#00FFA3]/50 transition-colors">
          <h2 className="text-[11px] font-semibold mb-8 border-l-2 border-[#00FFA3] pl-3 uppercase tracking-widest leading-none">
            01. Key Management
          </h2>
          
          <div className="space-y-6 flex-grow">
            <div>
              <label className="block text-[9px] text-gray-500 uppercase mb-2 tracking-widest">Public Meta Data</label>
              <div 
                onClick={() => metaKey?.publicKey && copyToClipboard(metaKey.publicKey, 'PUBLIC KEY')}
                className="w-full bg-black border border-[#333] p-3 text-[10px] font-mono break-all min-h-[60px] text-gray-400 cursor-pointer hover:border-[#00FFA3]/50 transition-colors"
              >
                {metaKey?.publicKey || "NO PUBLIC KEY LOADED"}
              </div>
            </div>
            
            <div>
              <label className="block text-[9px] text-gray-500 uppercase mb-2 tracking-widest">Private Key (Local)</label>
              <div 
                onClick={() => metaKey?.privateKey && copyToClipboard(metaKey.privateKey, 'PRIVATE KEY')}
                className="w-full bg-black border border-[#333] p-3 text-[10px] font-mono break-all text-gray-400 cursor-pointer hover:border-[#00FFA3]/50 transition-colors"
              >
                {metaKey?.privateKey || "NOT CONFIGURED"}
              </div>
            </div>

            {freighterPubKey ? (
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => handleCommand('keygen')}
                  disabled={isProcessing}
                  className="w-full py-4 border border-[#00FFA3] text-[#00FFA3] text-[10px] font-bold hover:bg-[#00FFA3] hover:text-black transition-all uppercase tracking-widest cursor-pointer disabled:opacity-50"
                >
                  Generate New Meta Keypair
                </button>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={importKeyInput}
                    onChange={(e) => setImportKeyInput(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Paste Private Meta Key..."
                    className="flex-1 bg-black border border-[#333] p-3 text-[10px] focus:border-[#00FFA3] outline-none text-gray-300 placeholder:text-gray-700 font-mono"
                  />
                  <button 
                    onClick={() => {
                      if (importKeyInput) {
                        handleCommand(`set_secret ${importKeyInput}`);
                        setImportKeyInput('');
                      }
                    }}
                    disabled={isProcessing || !importKeyInput}
                    className="px-4 border border-[#333] bg-black text-white text-[10px] hover:border-[#00FFA3] transition-colors disabled:opacity-30 cursor-pointer"
                  >
                    RESTORE
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => handleCommand('connect')}
                disabled={isProcessing}
                className="w-full py-6 border border-[#00FFA3] bg-[#00FFA3]/10 text-[#00FFA3] text-[12px] font-bold hover:bg-[#00FFA3] hover:text-black transition-all uppercase tracking-widest cursor-pointer shadow-[0_0_20px_rgba(0,255,163,0.2)]"
              >
                Connect Freighter Wallet
              </button>
            )}
            
            <p className="text-[9px] text-gray-600 leading-relaxed italic mt-4">
              * Keypairs are generated client-side. Metadata is never exposed to the underlying network layer.
            </p>
          </div>
        </section>

        {/* 02. Deposit Protocol */}
        <section className="border border-[#333] p-6 flex flex-col bg-[#0A0A0A]/80 backdrop-blur-sm relative overflow-hidden group hover:border-[#00FFA3]/50 transition-colors">
          <h2 className="text-[11px] font-semibold mb-8 border-l-2 border-[#00FFA3] pl-3 uppercase tracking-widest leading-none">
            02. Deposit Protocol
          </h2>
          
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-[9px] text-gray-500 uppercase mb-2 tracking-widest">Target Meta Public Key</label>
              <input 
                type="text" 
                value={targetMetaKey}
                onChange={(e) => setTargetMetaKey(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Leave blank to send to yourself..."
                className="w-full bg-black border border-[#333] p-3 text-[10px] focus:border-[#00FFA3] outline-none text-gray-300 placeholder:text-gray-700 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[100, 1000, 10000, 100000].map((amt) => (
                <button 
                  key={amt}
                  onClick={() => setSelectedAmount(amt)}
                  className={cn(
                    "p-3 border text-center transition-colors cursor-pointer",
                    selectedAmount === amt 
                      ? "border-[#00FFA3] bg-[#00FFA3]/10 text-[#00FFA3]" 
                      : "border-[#333] bg-black text-white hover:border-[#00FFA3]/50"
                  )}
                >
                  <div className="text-sm font-bold">{amt.toLocaleString()} <span className="text-[9px] text-gray-500 uppercase tracking-widest ml-1">XLM</span></div>
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => handleCommand(`deposit ${selectedAmount} ${targetMetaKey}`)}
              disabled={isProcessing || !selectedAmount || (!targetMetaKey && !metaKey?.publicKey) || !freighterPubKey}
              className="w-full py-4 mt-2 border border-[#00FFA3] bg-[#00FFA3]/10 text-[#00FFA3] text-[10px] font-bold hover:bg-[#00FFA3] hover:text-black transition-all uppercase tracking-widest cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,255,163,0.1)]"
            >
              EXECUTE DEPOSIT
            </button>
          </div>

          <div className="mt-auto pt-4 border-t border-[#333]">
            <div className="flex justify-between text-[9px] mb-4 tracking-widest uppercase">
              <span className="text-gray-500">ANONYMITY SET</span>
              <span className="text-white">Active</span>
            </div>
            <div className="text-[9px] text-gray-600 leading-tight uppercase">
              Provide a target meta key and denomination to initiate a one-way privacy deposit into the pool. Connect wallet first.
            </div>
          </div>
        </section>

        {/* 03. Secure Withdrawal */}
        <section className="border border-[#333] p-6 flex flex-col bg-[#0A0A0A]/80 backdrop-blur-sm relative overflow-hidden group hover:border-[#00FFA3]/50 transition-colors">
          <h2 className="text-[11px] font-semibold mb-8 border-l-2 border-[#00FFA3] pl-3 uppercase tracking-widest leading-none flex justify-between">
            03. Secure Withdrawal
            {scannedFunds.length > 0 && <span className="text-[#00FFA3] animate-pulse">{scannedFunds.length} CLUSTERS READY</span>}
          </h2>
          
          <div className="space-y-6 flex-grow flex flex-col">
            <button 
              onClick={() => handleCommand('scan')}
              disabled={isProcessing || !metaKey?.privateKey}
              className="w-full py-3 mb-2 border border-[#333] text-gray-300 text-[10px] hover:border-white transition-all uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCcw size={12} className={isProcessing ? "animate-spin" : ""} />
              Scan Blockchain For Funds
            </button>

            {scannedFunds.length > 0 && (
              <div className="space-y-2 max-h-32 overflow-y-auto scrollbar-hide mb-4 border border-[#333] p-2 bg-[#111]">
                <label className="block text-[9px] text-[#00FFA3] uppercase tracking-widest mb-2 px-1">Available Clusters</label>
                {scannedFunds.map((fund, idx) => (
                  <div 
                    key={fund.stealthAddress}
                    onClick={() => setSelectedFundIndex(idx)}
                    className={cn(
                      "p-3 border text-[10px] font-mono cursor-pointer transition-colors flex justify-between items-center",
                      selectedFundIndex === idx
                        ? "border-[#00FFA3] bg-[#00FFA3]/10 text-[#00FFA3]"
                        : "border-[#333] text-gray-400 hover:border-[#00FFA3]/50"
                    )}
                  >
                    <span>CLUSTER #{idx + 1}</span>
                    <span>{fund.stealthAddress.slice(0, 12)}...</span>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="block text-[9px] text-gray-500 uppercase tracking-widest">Recipient Address</label>
                {freighterPubKey && (
                  <button 
                    onClick={() => setWithdrawDest(freighterPubKey)}
                    className="text-[9px] text-[#00FFA3] hover:text-white uppercase tracking-widest cursor-pointer transition-colors disabled:opacity-30"
                    disabled={scannedFunds.length === 0}
                  >
                    [ USE WALLET ]
                  </button>
                )}
              </div>
              <input 
                type="text" 
                value={withdrawDest}
                onChange={(e) => setWithdrawDest(e.target.value)}
                placeholder="G... (Stellar Alpha-Address)"
                className="w-full bg-black border border-[#333] p-3 text-[10px] focus:border-[#00FFA3] outline-none text-gray-300 placeholder:text-gray-700 font-mono"
                disabled={scannedFunds.length === 0}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCommand(`withdraw ${withdrawDest}`);
                    setWithdrawDest('');
                  }
                }}
              />
            </div>
            
            <button 
              onClick={() => {
                handleCommand(`withdraw ${withdrawDest}`);
                setWithdrawDest('');
              }}
              disabled={isProcessing || scannedFunds.length === 0 || !withdrawDest || selectedFundIndex === null}
              className="w-full py-4 border border-[#00FFA3] bg-[#00FFA3]/10 text-[#00FFA3] text-[10px] font-bold hover:bg-[#00FFA3] hover:text-black transition-all uppercase tracking-widest cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,255,163,0.1)]"
            >
              EXECUTE WITHDRAWAL
            </button>

            <div className="bg-[#111] p-4 border-l border-white/10 space-y-3 mt-auto">
              <div className="flex justify-between text-[9px] tracking-widest uppercase">
                <span className="text-gray-500">MIXER READINESS</span>
                <span className="text-white italic">HIGH ANONYMITY</span>
              </div>
              <div className="w-full h-1 bg-[#222]">
                <div className="h-full bg-[#00FFA3] w-2/3 shadow-[0_0_8px_rgba(0,255,163,0.5)]"></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Terminal Footer Console */}
      <div className="h-40 border border-[#333] bg-black/80 backdrop-blur-sm flex flex-col overflow-hidden shrink-0 shadow-[0_0_30px_rgba(0,255,163,0.05)]">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#111] border-b border-[#333]">
          <span className="text-[9px] text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-[#00FFA3]" />
            Live Operation Console
          </span>
          <span className="text-[9px] text-[#00FFA3] opacity-50 uppercase tracking-tighter">
            root@stellar-privacy-term:~$
          </span>
        </div>

        {/* Console Lines */}
        <div 
          ref={scrollRef}
          className="flex-1 p-3 overflow-y-auto font-mono text-[10px] leading-relaxed scrollbar-hide"
        >
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
              {lines.map((line) => (
                <motion.div
                  key={line.id}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.1 }}
                  className={cn(
                    "flex gap-3",
                    line.type === 'error' && "text-red-500",
                    line.type === 'success' && "text-[#00FFA3]",
                    line.type === 'warning' && "text-yellow-400",
                    line.type === 'input' && "text-white"
                  )}
                >
                  <span className="opacity-30">[{new Date(line.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  <p className="whitespace-pre-wrap break-all">{line.content}</p>
                </motion.div>
              ))}
            </AnimatePresence>
            {isProcessing && (
              <div className="flex items-center gap-2 text-[#00FFA3] animate-pulse">
                <span>[LOG:]</span>
                <span>COMMUNICATING WITH SOROBAN NETWORK...</span>
              </div>
            )}
          </div>
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="border-t border-[#333] bg-[#0A0A0A] flex items-center gap-3 px-3 py-2">
          <span className="text-[#00FFA3] text-xs font-bold leading-none">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder={isProcessing ? "AWAITING RESPONSE..." : "ENTER COMMAND (HELP, KEYGEN, CONNECT, DEPOSIT, SCAN, WITHDRAW)..."}
            className="flex-1 bg-transparent border-none outline-none text-[#E0E0E0] placeholder:text-[#222] text-[10px] uppercase font-mono caret-[#00FFA3]"
          />
          <div className="flex items-center gap-1">
            <div className={cn("w-1.5 h-1.5 rounded-full transition-colors", isProcessing ? "bg-yellow-400" : "bg-[#00FFA3]")} />
          </div>
        </form>
      </div>
    </div>
  );
};
