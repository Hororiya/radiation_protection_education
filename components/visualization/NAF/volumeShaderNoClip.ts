/**
 * 体渲染 shader 字符串（无裁剪平面），供 A-Frame 组件使用。
 * 使用纯 GLSL 300 es + RawShaderMaterial，避免 ShaderMaterial 的 fragment 前缀导致编译失败。
 */

export const VOLUME_VERTEX_SHADER = `

precision highp float;
in vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec3 v_origin;
out vec3 v_direction;

void main(){
  vec4 position4=vec4(position,1.);
  v_origin=(inverse(modelViewMatrix)*vec4(0.,0.,0.,1.)).xyz;
  v_direction=position-v_origin;
  gl_Position=projectionMatrix*modelViewMatrix*position4;
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
uniform float u_samplingRate;
uniform bool u_hasSceneDepth;
uniform float u_depthEpsilon;
uniform vec2 u_clim;
uniform highp sampler3D u_data;
uniform highp sampler2D u_cmdata;
uniform highp sampler2D u_sceneDepth;
uniform vec2 u_depthTexSize;
uniform mat4 u_modelMatrix;
uniform mat4 u_modelMatrixInverse;
uniform mat4 viewMatrix;
uniform mat4 u_projectionMatrixInverse;
uniform mat4 u_viewMatrixInverse;

in vec3 v_origin;
in vec3 v_direction;

layout(location=0) out vec4 fragColor;

const int MAX_STEPS=2048;
const int REFINEMENT_STEPS=4;
const float shininess=40.;

struct ClippedResult{ bool clipped; bool guarded; };

vec2 intersect_aabb(vec3 rayOrigin,vec3 rayDir,vec3 boxMin,vec3 boxMax);
vec3 local_to_texture(vec3 localPosition);
vec3 scene_depth_to_local(vec2 uv,float depth);
void cast_mip(vec3 entryPoint,vec3 rayDir,float samples,float tStart,float tEnd,float tIncr);
void cast_iso(vec3 entryPoint,vec3 rayDir,float samples,float tStart,float tEnd,float tIncr);
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

vec3 safe_dir(vec3 rayDir){
  return vec3(
    abs(rayDir.x)<1e-8 ? (rayDir.x<0. ? -1e-8 : 1e-8) : rayDir.x,
    abs(rayDir.y)<1e-8 ? (rayDir.y<0. ? -1e-8 : 1e-8) : rayDir.y,
    abs(rayDir.z)<1e-8 ? (rayDir.z<0. ? -1e-8 : 1e-8) : rayDir.z
  );
}

vec2 intersect_aabb(vec3 rayOrigin,vec3 rayDir,vec3 boxMin,vec3 boxMax){
  vec3 invDir=1./safe_dir(rayDir);
  vec3 tMin=(boxMin-rayOrigin)*invDir;
  vec3 tMax=(boxMax-rayOrigin)*invDir;
  vec3 t1=min(tMin,tMax);
  vec3 t2=max(tMin,tMax);
  float tNear=max(max(t1.x,t1.y),t1.z);
  float tFar=min(min(t2.x,t2.y),t2.z);
  return vec2(tNear,tFar);
}

vec3 local_to_texture(vec3 localPosition){
  return clamp((localPosition+vec3(.5))/u_size,vec3(0.),vec3(1.));
}

vec3 scene_depth_to_local(vec2 uv,float depth){
  vec4 ndc=vec4(uv*2.-1.,depth*2.-1.,1.);
  vec4 viewPos=u_projectionMatrixInverse*ndc;
  viewPos/=viewPos.w;
  vec4 worldPos=u_viewMatrixInverse*viewPos;
  return (u_modelMatrixInverse*worldPos).xyz;
}

float sample1(vec3 texcoords){
  return (u_coefficient*texture(u_data,clamp(texcoords.xyz,vec3(0.),vec3(1.))).r)+u_offset;
}

vec4 apply_colormap(float val){
  val=clamp((val-u_clim[0])/max(u_clim[1]-u_clim[0],1e-12),0.,1.);
  return texture(u_cmdata,vec2(val,.5));
}

void cast_mip(vec3 entryPoint,vec3 rayDir,float samples,float tStart,float tEnd,float tIncr){
  float max_val=-1e6;
  bool updated=false;
  for(int iter=0;iter<MAX_STEPS;iter++){
    float i=float(iter);
    if(i>=samples) break;
    float t=tStart+tIncr*i;
    if(t>tEnd) break;
    vec3 localPosition=entryPoint+rayDir*t;
    vec3 loc=local_to_texture(localPosition);
    vec3 vClipPosition=clip_position(localPosition);
    ClippedResult clippedResult=within_boundaries(vClipPosition);
    bool clipped=clippedResult.clipped;
    bool guarded=clippedResult.guarded;
    float val=sample1(loc);
    if(guarded) val=u_boardCoefficient*val+u_boardOffset;
    if(val>max_val&&!clipped){ max_val=val; updated=true; }
  }
  if(updated){
    fragColor=apply_colormap(max_val);
    fragColor.a=u_opacity;
  }
}

void cast_iso(vec3 entryPoint,vec3 rayDir,float samples,float tStart,float tEnd,float tIncr){
  fragColor=vec4(0.);
  vec3 dstep=1.5/u_size;
  float renderthreshold=(u_clim[1]-u_clim[0])*u_renderthreshold+u_clim[0];
  float low_threshold=renderthreshold-.02*(u_clim[1]-u_clim[0]);
  for(int iter=0;iter<MAX_STEPS;iter++){
    float i=float(iter);
    if(i>=samples) break;
    float t=tStart+tIncr*i;
    if(t>tEnd) break;
    vec3 localPosition=entryPoint+rayDir*t;
    vec3 loc=local_to_texture(localPosition);
    ClippedResult clippedResult=within_boundaries(clip_position(localPosition));
    bool clipped=clippedResult.clipped;
    bool guarded=clippedResult.guarded;
    float val=sample1(loc);
    if(guarded) val=u_boardCoefficient*val+u_boardOffset;
    if(val>low_threshold&&!clipped){
      float istep=tIncr/float(REFINEMENT_STEPS);
      float refinedT=max(0.,t-.5*tIncr);
      for(int i=0;i<REFINEMENT_STEPS;i++){
        vec3 refinedLocalPosition=entryPoint+rayDir*refinedT;
        vec3 refinedLoc=local_to_texture(refinedLocalPosition);
        clippedResult=within_boundaries(clip_position(refinedLocalPosition));
        clipped=clippedResult.clipped;
        guarded=clippedResult.guarded;
        val=sample1(refinedLoc);
        if(val>renderthreshold||clipped){
          float coefficient=guarded?u_boardCoefficient:1.;
          float offset=guarded?u_boardOffset:0.;
          fragColor=add_lighting(val,refinedLoc,dstep,rayDir,coefficient,offset);
          fragColor.a=u_opacity;
          return;
        }
        refinedT+=istep;
      }
    }
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
  vec3 rayDir=normalize(v_direction);
  vec3 boxMin=vec3(-.5);
  vec3 boxMax=u_size-vec3(.5);
  vec2 intersection=intersect_aabb(v_origin,rayDir,boxMin,boxMax);
  if(intersection.x>intersection.y) discard;

  intersection.x=max(intersection.x,0.);

  if(u_hasSceneDepth){
    vec2 depthUv=gl_FragCoord.xy/u_depthTexSize;
    if(all(greaterThanEqual(depthUv,vec2(0.)))&&all(lessThanEqual(depthUv,vec2(1.)))){
      float sceneDepth=texture(u_sceneDepth,depthUv).x;
      if(sceneDepth<.999999){
        vec3 occluderLocal=scene_depth_to_local(depthUv,sceneDepth);
        float occluderT=dot(occluderLocal-v_origin,rayDir)-u_depthEpsilon;
        intersection.y=min(intersection.y,occluderT);
      }
    }
  }

  if(intersection.x>=intersection.y) discard;

  vec3 entryPoint=v_origin+rayDir*intersection.x;
  vec3 exitPoint=v_origin+rayDir*intersection.y;
  vec3 entryToExit=exitPoint-entryPoint;
  float tEnd=max(length(entryToExit),1e-6);
  float samples=ceil(max(1.,u_samplingRate*tEnd));
  float tIncr=tEnd/samples;
  float tStart=.5*tIncr;

  if(u_renderstyle==0) cast_mip(entryPoint,rayDir,samples,tStart,tEnd,tIncr);
  else if(u_renderstyle==1) cast_iso(entryPoint,rayDir,samples,tStart,tEnd,tIncr);
  if(fragColor.a<.05) discard;
}
`;
