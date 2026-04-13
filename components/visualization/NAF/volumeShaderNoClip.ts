/**
 * 体渲染 shader 字符串（无裁剪平面），供 A-Frame 组件使用。
 * 使用纯 GLSL 300 es + RawShaderMaterial，避免 ShaderMaterial 的 fragment 前缀导致编译失败。
 */

export const VOLUME_VERTEX_SHADER = `

precision highp float;
in vec3 position;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
out vec4 v_nearpos;
out vec4 v_farpos;
out vec3 v_position;

void main(){
  mat4 viewtransformf=modelViewMatrix;
  mat4 viewtransformi=inverse(modelViewMatrix);
  vec4 position4=vec4(position,1.);
  vec4 pos_in_cam=viewtransformf*position4;
  pos_in_cam.z=-pos_in_cam.w;
  v_nearpos=viewtransformi*pos_in_cam;
  pos_in_cam.z=pos_in_cam.w;
  v_farpos=viewtransformi*pos_in_cam;
  v_position=position;
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*position4;
}
`;

export const VOLUME_FRAGMENT_SHADER = `

precision highp float;
precision mediump sampler3D;

uniform vec3 u_size;
uniform int u_renderstyle;
uniform float u_renderthreshold;
uniform float u_coefficient;
uniform float u_offset;
uniform float u_boardCoefficient;
uniform float u_boardOffset;
uniform float u_opacity;
uniform vec2 u_clim;
uniform highp sampler3D u_data;
uniform highp sampler2D u_cmdata;
uniform mat4 u_modelMatrix;
uniform mat4 viewMatrix;

in vec3 v_position;
in vec4 v_nearpos;
in vec4 v_farpos;

layout(location=0) out vec4 fragColor;

const int MAX_STEPS=221;
const int REFINEMENT_STEPS=4;
const float relative_step_size=1.;
const float shininess=40.;

struct ClippedResult{ bool clipped; bool guarded; };

void cast_mip(vec3 start_loc,vec3 stepVec,int nsteps,vec3 view_ray);
void cast_iso(vec3 start_loc,vec3 stepVec,int nsteps,vec3 view_ray);
vec3 clip_position(vec3 position);
ClippedResult within_boundaries(vec3 position);
float sample1(vec3 texcoords);
vec4 apply_colormap(float val);
vec4 add_lighting(float val,vec3 loc,vec3 stepVec,vec3 view_ray,float coefficient,float offset);

ClippedResult within_boundaries(vec3 position){
  ClippedResult result;
  result.clipped=false;
  result.guarded=false;
  return result;
}

vec3 clip_position(vec3 position){
  vec4 position4=vec4(position,1.);
  vec4 mvPosition=viewMatrix*u_modelMatrix*position4;
  return -mvPosition.xyz;
}

float sample1(vec3 texcoords){
  return (u_coefficient*texture(u_data,texcoords.xyz).r)+u_offset;
}

vec4 apply_colormap(float val){
  val=(val-u_clim[0])/(u_clim[1]-u_clim[0]);
  return texture(u_cmdata,vec2(val,.5));
}

void cast_mip(vec3 start_loc,vec3 stepVec,int nsteps,vec3 view_ray){
  float max_val=-1e6;
  int max_i=100;
  vec3 loc=start_loc;
  bool updated=false;
  for(int iter=0;iter<MAX_STEPS;iter++){
    if(iter>=nsteps) break;
    vec3 uv_position=u_size*loc;
    vec3 vClipPosition=clip_position(uv_position);
    ClippedResult clippedResult=within_boundaries(vClipPosition);
    bool clipped=clippedResult.clipped;
    bool guarded=clippedResult.guarded;
    float val=sample1(loc);
    if(guarded) val=u_boardCoefficient*val+u_boardOffset;
    if(val>max_val&&!clipped){ max_val=val; max_i=iter; updated=true; }
    loc+=stepVec;
  }
  vec3 iloc=start_loc+stepVec*(float(max_i)-.5);
  vec3 istep=stepVec/float(REFINEMENT_STEPS);
  for(int i=0;i<REFINEMENT_STEPS;i++){
    vec3 uv_position=u_size*iloc;
    ClippedResult clippedResult=within_boundaries(clip_position(uv_position));
    bool guarded=clippedResult.guarded;
    float val=sample1(iloc);
    if(guarded) val=u_boardCoefficient*val+u_boardOffset;
    max_val=max(max_val,val);
    iloc+=istep;
  }
  if(updated){
    fragColor=apply_colormap(max_val);
    fragColor.a=u_opacity;
  }
}

void cast_iso(vec3 start_loc,vec3 stepVec,int nsteps,vec3 view_ray){
  fragColor=vec4(0.);
  vec3 dstep=1.5/u_size;
  vec3 loc=start_loc;
  float renderthreshold=(u_clim[1]-u_clim[0])*u_renderthreshold+u_clim[0];
  float low_threshold=renderthreshold-.02*(u_clim[1]-u_clim[0]);
  for(int iter=0;iter<MAX_STEPS;iter++){
    if(iter>=nsteps) break;
    vec3 uv_position=u_size*loc;
    ClippedResult clippedResult=within_boundaries(clip_position(uv_position));
    bool clipped=clippedResult.clipped;
    bool guarded=clippedResult.guarded;
    float val=sample1(loc);
    if(guarded) val=u_boardCoefficient*val+u_boardOffset;
    if(val>low_threshold&&!clipped){
      vec3 iloc=loc-.5*stepVec;
      vec3 istep=stepVec/float(REFINEMENT_STEPS);
      for(int i=0;i<REFINEMENT_STEPS;i++){
        clippedResult=within_boundaries(clip_position(u_size*iloc));
        clipped=clippedResult.clipped;
        guarded=clippedResult.guarded;
        val=sample1(iloc);
        if(val>renderthreshold||clipped){
          float coefficient=guarded?u_boardCoefficient:1.;
          float offset=guarded?u_boardOffset:0.;
          fragColor=add_lighting(val,iloc,dstep,view_ray,coefficient,offset);
          fragColor.a=u_opacity;
          return;
        }
        iloc+=istep;
      }
    }
    loc+=stepVec;
  }
}

vec4 add_lighting(float val,vec3 loc,vec3 stepVec,vec3 view_ray,float coefficient,float offset){
  vec3 V=normalize(view_ray);
  vec3 N;
  float val1=sample1(loc+vec3(-stepVec[0],0.,0.));
  float val2=sample1(loc+vec3(stepVec[0],0.,0.));
  N[0]=val1-val2;
  val=max(max(val1,val2),val);
  val1=sample1(loc+vec3(0.,-stepVec[1],0.));
  val2=sample1(loc+vec3(0.,stepVec[1],0.));
  N[1]=val1-val2;
  val=max(max(val1,val2),val);
  val1=sample1(loc+vec3(0.,0.,-stepVec[2]));
  val2=sample1(loc+vec3(0.,0.,stepVec[2]));
  N[2]=val1-val2;
  val=max(max(val1,val2),val);
  val=coefficient*val+offset;
  N=normalize(N);
  float Nselect=float(dot(N,V)>0.);
  N=(2.*Nselect-1.)*N;
  vec3 L=normalize(view_ray);
  float lambertTerm=clamp(dot(N,L),0.,1.);
  vec3 H=normalize(L+V);
  float specularTerm=pow(max(dot(H,N),0.),shininess);
  vec4 color=apply_colormap(val);
  fragColor=color*vec4(lambertTerm,lambertTerm,lambertTerm,1.)+vec4(specularTerm,specularTerm,specularTerm,0.);
  fragColor.a=color.a;
  return fragColor;
}

void main(){
  fragColor=vec4(0.,0.,0.,0.);
  vec3 farpos=v_farpos.xyz/v_farpos.w;
  vec3 nearpos=v_nearpos.xyz/v_nearpos.w;
  vec3 view_ray=normalize(nearpos.xyz-farpos.xyz);
  float rayDist=dot(nearpos-v_position,view_ray);
  rayDist=max(rayDist,min((-.5-v_position.x)/view_ray.x,(u_size.x-.5-v_position.x)/view_ray.x));
  rayDist=max(rayDist,min((-.5-v_position.y)/view_ray.y,(u_size.y-.5-v_position.y)/view_ray.y));
  rayDist=max(rayDist,min((-.5-v_position.z)/view_ray.z,(u_size.z-.5-v_position.z)/view_ray.z));
  vec3 front=v_position+view_ray*rayDist;
  int nsteps=int(-rayDist/relative_step_size+.5);
  if(nsteps<1) discard;
  vec3 stepVec=((v_position-front)/u_size)/float(nsteps);
  vec3 start_loc=front/u_size;
  if(u_renderstyle==0) cast_mip(start_loc,stepVec,nsteps,view_ray);
  else if(u_renderstyle==1) cast_iso(start_loc,stepVec,nsteps,view_ray);
  if(fragColor.a<.05) discard;
}
`;
