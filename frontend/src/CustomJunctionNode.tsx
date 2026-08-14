import { Handle, Position } from 'reactflow';

export default function CustomJunctionNode({ data }: { data: any }) {
  const light = data.light || { N: 'Red', S: 'Red', E: 'Red', W: 'Red' };
  
  // Backwards compatibility if light is still a string
  const lN = typeof light === 'object' ? light.N : light;
  const lS = typeof light === 'object' ? light.S : light;
  const lE = typeof light === 'object' ? light.E : 'Red';
  const lW = typeof light === 'object' ? light.W : 'Red';

  const getColor = (state: string) => state === 'Green' ? '#4caf50' : '#f44336';

  return (
    <div style={{
      width: '120px', height: '120px',
      backgroundColor: '#444',
      position: 'relative',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid #555'
    }}>
      {/* North */}
      <Handle type="target" position={Position.Top} id="N_in" style={{ left: '40%', top: -8, width: 16, height: 16, backgroundColor: '#4caf50', border: '2px solid white', zIndex: 20 }} />
      <Handle type="source" position={Position.Top} id="N_out" style={{ left: '60%', top: -8, width: 16, height: 16, backgroundColor: '#2196F3', border: '2px solid white', zIndex: 20 }} />
      
      {/* South */}
      <Handle type="target" position={Position.Bottom} id="S_in" style={{ left: '60%', bottom: -8, width: 16, height: 16, backgroundColor: '#4caf50', border: '2px solid white', zIndex: 20 }} />
      <Handle type="source" position={Position.Bottom} id="S_out" style={{ left: '40%', bottom: -8, width: 16, height: 16, backgroundColor: '#2196F3', border: '2px solid white', zIndex: 20 }} />
      
      {/* West */}
      <Handle type="target" position={Position.Left} id="W_in" style={{ top: '60%', left: -8, width: 16, height: 16, backgroundColor: '#4caf50', border: '2px solid white', zIndex: 20 }} />
      <Handle type="source" position={Position.Left} id="W_out" style={{ top: '40%', left: -8, width: 16, height: 16, backgroundColor: '#2196F3', border: '2px solid white', zIndex: 20 }} />
      
      {/* East */}
      <Handle type="target" position={Position.Right} id="E_in" style={{ top: '40%', right: -8, width: 16, height: 16, backgroundColor: '#4caf50', border: '2px solid white', zIndex: 20 }} />
      <Handle type="source" position={Position.Right} id="E_out" style={{ top: '60%', right: -8, width: 16, height: 16, backgroundColor: '#2196F3', border: '2px solid white', zIndex: 20 }} />

      {/* Crosswalks and roads inside */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '35%', right: '35%', backgroundColor: '#222' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: '35%', bottom: '35%', backgroundColor: '#222' }} />

      <div style={{ position: 'absolute', top: 10, left: 10, right: 10, height: 10, background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, white 5px, white 10px)' }} />
      <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, height: 10, background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, white 5px, white 10px)' }} />
      <div style={{ position: 'absolute', left: 10, top: 10, bottom: 10, width: 10, background: 'repeating-linear-gradient(0deg, transparent, transparent 5px, white 5px, white 10px)' }} />
      <div style={{ position: 'absolute', right: 10, top: 10, bottom: 10, width: 10, background: 'repeating-linear-gradient(0deg, transparent, transparent 5px, white 5px, white 10px)' }} />

      {/* Traffic Lights */}
      {/* North Light (controls vehicles entering from North, so it's placed near North) */}
      <div style={{ position: 'absolute', top: 25, left: '50%', transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', backgroundColor: getColor(lN), boxShadow: `0 0 10px ${getColor(lN)}` }} />
      {/* South Light */}
      <div style={{ position: 'absolute', bottom: 25, left: '50%', transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', backgroundColor: getColor(lS), boxShadow: `0 0 10px ${getColor(lS)}` }} />
      {/* East Light */}
      <div style={{ position: 'absolute', right: 25, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', backgroundColor: getColor(lE), boxShadow: `0 0 10px ${getColor(lE)}` }} />
      {/* West Light */}
      <div style={{ position: 'absolute', left: 25, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', backgroundColor: getColor(lW), boxShadow: `0 0 10px ${getColor(lW)}` }} />

      <div style={{ position: 'absolute', top: '-25px', color: 'white', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
        {data.label}
      </div>
    </div>
  );
}
