
	#ifndef _DATATYPE_H_
	#define _DATATYPE_H_
	#endif


	typedef unsigned char       BYTE;
	typedef unsigned short      WORD;
	typedef unsigned long       DWORD;
	typedef unsigned int        UINT;
	typedef unsigned int		BOOL;


	#define LOBYTE(w)           ((BYTE)(w))
	#define HIBYTE(w)           ((BYTE)((UINT)(w) >> 8))
	#define LOWORD(l)           ((WORD)(l))
	#define HIWORD(l)           ((WORD)((DWORD)(l) >> 16))
	#define FALSE				0
	#define TRUE				1
	#define FORWARD				0
	#define BACKWARD			1
