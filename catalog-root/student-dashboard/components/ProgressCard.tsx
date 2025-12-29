import React from 'react'

export default function ProgressCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="tile" style={{textAlign:'left'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}>
        <div>
          <div style={{fontSize:14,fontWeight:700}}>{label}</div>
          <div className="muted" style={{fontSize:13}}>Overall progress</div>
        </div>
        <div style={{fontSize:28,fontWeight:800}}>{value}%</div>
      </div>
      <div style={{width:'100%',height:10,background:'#eef3ff',borderRadius:8,marginTop:12}}>
        <div style={{height:'100%',width:`${value}%`,background:'#0b5cff',borderRadius:8}} />
      </div>
    </div>
  )
}
