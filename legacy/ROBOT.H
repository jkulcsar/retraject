
	#ifndef _DATATYPE_H
	#include "datatype.h"
	#endif


	#ifndef _JOINT_H
	#include "joint.h"
	#endif

	#ifndef	_ROBOT_H
	#define	_ROBOT_H
	#endif


	#ifdef __cplusplus
		#define __CPPARGS ...
	#else
		#define __CPPARGS
	#endif



	class	Robot
	{

			protected:
				Joint*	m_pJoint;
				UINT	m_uiNrOfJoints;
				UINT	m_uiNrOfPoints;

				BOOL	m_bCommandOK;

				UINT	m_uiQuantum;
				DWORD	m_dwFrequency;
				UINT	m_uiMaxDivisions;		// max nr of divisions per trajectory

			// methods ...
			public:
				BOOL	SetMaxDivisionsTo( UINT );
				BOOL	SetQuantumTo( UINT );
				UINT	FindOutQuantum();
				BOOL	SetUpTime();
				BOOL	Setup();
				BOOL	Show();
				BOOL	DumpOut();
				BOOL	Compute();
				BOOL	Command();

				Robot();
				~Robot();

	};



